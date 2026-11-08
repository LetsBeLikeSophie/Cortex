// Deleting an account and moving a guest's data into an account.
import { createHmac } from "node:crypto";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config, required } from "../config.js";
import { recordOnlyRaw } from "./billingRules.js";
import { Category } from "./categories.js";
import type { SearchInterpretation } from "./anthropic.js";
import { scanPages } from "./scanPages.js";
import { SOURCE_CATALOG, CAPTURE_TYPE_CATALOG } from "./sourceCatalog.js";
import { newestOfBoth, tagArrayLiteral, tagsArrayLiteral } from "./tagQuery.js";
import { tagLockChange, type LockState } from "./tagLock.js";
import { SCREENSHOTS_BUCKET, getClient } from "./db.js";
import { moveLockedTags } from "./lockTrash.js";
import { SAMPLE_TITLES } from "./samples.js";
import { listUserFiles } from "./stats.js";

// An account by its email, paging through every account (legacy Kakao
// accounts made before kakao_users existed; slow, so it's the fallback).
export async function findUserIdByEmail(email: string): Promise<string | null> {
  for (let page = 1; ; page++) {
    const { data, error } = await getClient().auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`findUserIdByEmail failed: ${error.message}`);
    const hit = data.users.find((u) => u.email === email);
    if (hit) return hit.id;
    if (data.users.length < 1000) return null;
  }
}

// Removes everything a user's account owns: uploaded screenshots (stored
// under `${userId}/...` in the bucket, per uploadScreenshot above), item
// rows, then the auth user itself. Called from both account-deletion paths
// (self-serve DELETE /auth/me and the Kakao unlink webhook) so a deleted
// account doesn't leave orphaned screenshot files sitting in Storage forever.
export async function deleteUserAccount(userId: string): Promise<void> {
  const client = getClient();

  // Detaching first (safe to repeat): if it fails, nothing is gone yet, so
  // a retry never finds an account with no memos left.
  // Purchases stay 5 years for refunds and tax, no longer saying whose they were
  // (decision C2). The token stays: it can be restored on a new account.
  const { data: purchases, error: purchasesError } = await client.from("purchases").select("id, raw").eq("user_id", userId);
  if (purchasesError) throw new Error(`failed to read purchases: ${purchasesError.message}`);
  for (const row of purchases ?? []) {
    const { error } = await client.from("purchases").update({ user_id: null, raw: recordOnlyRaw(row.raw) }).eq("id", row.id);
    if (error) throw new Error(`failed to detach purchase: ${error.message}`);
  }
  // Per-call cost log: keep the rows (aggregate cost), drop who made them.
  const { error: callsError } = await client.from("ai_calls").update({ user_id: null }).eq("user_id", userId);
  if (callsError) console.error(`failed to detach ai_calls: ${callsError.message}`);

  const names = await listUserFiles(userId);
  for (let i = 0; i < names.length; i += 1000) {
    const paths = names.slice(i, i + 1000).map((name) => `${userId}/${name}`);
    const { error: removeError } = await client.storage.from(SCREENSHOTS_BUCKET).remove(paths);
    if (removeError) throw new Error(`failed to delete screenshots: ${removeError.message}`);
  }

  const { error: itemsError } = await client.from("items").delete().eq("user_id", userId);
  if (itemsError) throw new Error(`failed to delete items: ${itemsError.message}`);

  const { error: planError } = await client.from("user_plans").delete().eq("user_id", userId);
  if (planError) throw new Error(`failed to delete plan: ${planError.message}`);
  const { error: usageError } = await client.from("ai_usage").delete().eq("user_id", userId);
  if (usageError) throw new Error(`failed to delete usage log: ${usageError.message}`);
  const { error: reportsError } = await client.from("ai_reports").delete().eq("user_id", userId);
  if (reportsError) throw new Error(`failed to delete AI reports: ${reportsError.message}`);
  const { error: lockedTagsError } = await client.from("locked_tags").delete().eq("user_id", userId);
  if (lockedTagsError) throw new Error(`failed to delete locked tags: ${lockedTagsError.message}`);

  const { error: mappingError } = await client.from("kakao_users").delete().eq("user_id", userId);
  if (mappingError) throw new Error(`failed to delete kakao_users mapping: ${mappingError.message}`);

  const { error: userError } = await client.auth.admin.deleteUser(userId);
  if (userError) throw new Error(`failed to delete user: ${userError.message}`);
}

// A guest who signs in with Kakao/Google keeps what they saved: the guest's
// items (and their screenshot files) move to the real account, along with
// this month's AI usage and the AI-consent answer if the account has none,
// then the guest account is deleted. Works for a brand-new account and for
// one already in use (the items are simply added). The guest's copy of the
// sample guide item is dropped if the account already has one.

export async function claimGuestAccount(targetId: string, guestId: string): Promise<{ moved: number }> {
  const client = getClient();

  // Screenshot files live under "<userId>/..." -- move them first, so an
  // item never points at a path that doesn't exist yet.
  for (const name of await listUserFiles(guestId)) {
    const { error } = await client.storage.from(SCREENSHOTS_BUCKET).move(`${guestId}/${name}`, `${targetId}/${name}`);
    if (error) throw new Error(`claim: move screenshot failed: ${error.message}`);
  }

  const { data: targetSample } = await client.from("items").select("id").eq("user_id", targetId).in("title", SAMPLE_TITLES).limit(1);
  if (targetSample && targetSample.length > 0) {
    await client.from("items").delete().eq("user_id", guestId).in("title", SAMPLE_TITLES);
  }

  // The server caps a select at 1000 rows, so read again until nothing of
  // the guest's is left (moved rows drop out of the next read). A run cut
  // short picks up where it stopped when the app retries.
  let moved = 0;
  for (;;) {
    const { data: batch, error: itemsError } = await client.from("items").select("id, image_path").eq("user_id", guestId).limit(500);
    if (itemsError) throw new Error(`claim: read items failed: ${itemsError.message}`);
    const rows = (batch ?? []) as { id: string; image_path: string | null }[];
    if (rows.length === 0) break;
    for (const it of rows) {
      const imagePath = it.image_path?.startsWith(`${guestId}/`) ? `${targetId}/${it.image_path.slice(guestId.length + 1)}` : it.image_path;
      const { error } = await client.from("items").update({ user_id: targetId, image_path: imagePath }).eq("id", it.id).eq("user_id", guestId);
      if (error) throw new Error(`claim: move item failed: ${error.message}`);
    }
    moved += rows.length;
  }

  // A Pro bought as a guest belongs to the person too (the plan is
  // recomputed from purchases by the caller).
  // Each move is checked: the guest is deleted below, so a move that failed
  // unnoticed would lose the purchase for good. Thrown, the app's retry runs
  // the whole claim again.
  const moves = [
    ["purchases", await client.from("purchases").update({ user_id: targetId }).eq("user_id", guestId)],
    // This month's AI use follows the person (no fresh quota by switching).
    ["ai_usage", await client.from("ai_usage").update({ user_id: targetId }).eq("user_id", guestId)],
    ["ai_calls", await client.from("ai_calls").update({ user_id: targetId }).eq("user_id", guestId)],
    // A tag both had locked is one row on the account already; upsert skips it.
    ["locked_tags", await moveLockedTags(client, guestId, targetId)],
  ] as const;
  for (const [table, { error }] of moves) {
    if (error) throw new Error(`claim: move ${table} failed: ${error.message}`);
  }

  // The consent answer and language are the same person's -- carry them
  // over only where the account hasn't answered itself.
  const { data: plans, error: plansError } = await client.from("user_plans").select("user_id, ai_consent, ai_consent_at, ai_consent_version, lang").in("user_id", [guestId, targetId]);
  if (plansError) throw new Error(`claim: read plans failed: ${plansError.message}`);
  const guestPlan = plans?.find((p) => p.user_id === guestId);
  const targetPlan = plans?.find((p) => p.user_id === targetId);
  if (guestPlan && targetPlan && !targetPlan.ai_consent && guestPlan.ai_consent) {
    await client
      .from("user_plans")
      .update({ ai_consent: guestPlan.ai_consent, ai_consent_at: guestPlan.ai_consent_at, ai_consent_version: guestPlan.ai_consent_version })
      .eq("user_id", targetId)
      .then(({ error }) => {
        if (error) throw new Error(`claim: copy consent failed: ${error.message}`);
      });
  }
  if (guestPlan && targetPlan && !targetPlan.lang && guestPlan.lang) {
    await client.from("user_plans").update({ lang: guestPlan.lang }).eq("user_id", targetId);
  }

  // Whatever is left of the guest (plan row, auth user) goes -- only once
  // none of its memos are left to lose.
  const { count, error: countError } = await client.from("items").select("id", { count: "exact", head: true }).eq("user_id", guestId);
  if (countError || count !== 0) throw new Error(`claim: guest still has items (${countError?.message ?? count})`);
  await deleteUserAccount(guestId);
  return { moved };
}
