// Memo lock, tag lock, trash, restore, permanent delete, AI result reports.
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
import { ItemRecord, getItemForUser } from "./items.js";

// Soft delete: moves the item to the trash instead of removing it (an
// archive app shouldn't make "permanently gone" the default outcome of one
// tap). The screenshot file stays in Storage too, since restoring later
// needs it. Scoped to the owning user -- .eq("user_id", userId) is the
// ownership check, since the service-role client bypasses RLS entirely.
export async function trashItem(userId: string, itemId: string): Promise<void> {
  const { error, count } = await getClient()
    .from("items")
    .update({ deleted_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", itemId)
    .eq("user_id", userId)
    .is("deleted_at", null);
  if (error) throw new Error(`trashItem failed: ${error.message}`);
  if (!count) throw new Error("item not found");
}

// By hand: a memo locked here stays locked when its tag opens.
export async function setItemLocked(userId: string, itemId: string, locked: boolean): Promise<void> {
  const { error, count } = await getClient()
    .from("items")
    .update({ locked, locked_by_tag: false }, { count: "exact" })
    .eq("id", itemId)
    .eq("user_id", userId);
  if (error) throw new Error(`setItemLocked failed: ${error.message}`);
  if (!count) throw new Error("item not found");
}

// Turning the memo lock off (the PIN is gone) opens every locked memo, and
// every locked tag with it.
export async function unlockAllItems(userId: string): Promise<number> {
  const { error, count } = await getClient().from("items").update({ locked: false, locked_by_tag: false }, { count: "exact" }).eq("user_id", userId).eq("locked", true);
  if (error) throw new Error(`unlockAllItems failed: ${error.message}`);
  const { error: tagsError } = await getClient().from("locked_tags").delete().eq("user_id", userId);
  if (tagsError) throw new Error(`unlockAllItems tags failed: ${tagsError.message}`);
  return count ?? 0;
}

// --- tag lock (lib/tagLock.ts) ---------------------------------------------

export async function listLockedTags(userId: string): Promise<string[]> {
  const { data, error } = await getClient().from("locked_tags").select("tag").eq("user_id", userId).order("created_at", { ascending: true });
  if (error) throw new Error(`listLockedTags failed: ${error.message}`);
  return (data ?? []).map((r) => r.tag as string);
}

// Every memo with `tag` (AI or own) that isn't locked yet gets locked by
// the tag. Filtered and written in the database, no matter how many.
async function lockMemosWithTag(userId: string, tag: string): Promise<void> {
  for (const column of ["tags", "user_tags"] as const) {
    const { error } = await getClient()
      .from("items")
      .update({ locked: true, locked_by_tag: true })
      .eq("user_id", userId)
      .eq("locked", false)
      .contains(column, tagArrayLiteral(tag));
    if (error) throw new Error(`lockMemosWithTag failed: ${error.message}`);
  }
}

export async function lockTag(userId: string, tag: string): Promise<void> {
  const { error } = await getClient().from("locked_tags").upsert({ user_id: userId, tag }, { onConflict: "user_id,tag", ignoreDuplicates: true });
  if (error) throw new Error(`lockTag failed: ${error.message}`);
  await lockMemosWithTag(userId, tag);
}

// Opens the memos the tag locked, unless another locked tag still holds
// them. The memos open first, in one database update per column, and the
// tag's row goes last: a failure halfway leaves the tag still locked (and
// shown with its open button), so trying again finishes the job.
export async function unlockTag(userId: string, tag: string): Promise<void> {
  const still = (await listLockedTags(userId)).filter((t) => t !== tag);
  for (const column of ["tags", "user_tags"] as const) {
    let q = getClient()
      .from("items")
      .update({ locked: false, locked_by_tag: false })
      .eq("user_id", userId)
      .eq("locked_by_tag", true)
      .contains(column, tagArrayLiteral(tag));
    if (still.length) q = q.not("tags", "ov", tagsArrayLiteral(still)).not("user_tags", "ov", tagsArrayLiteral(still));
    const { error } = await q;
    if (error) throw new Error(`unlockTag update failed: ${error.message}`);
  }
  const { error } = await getClient().from("locked_tags").delete().eq("user_id", userId).eq("tag", tag);
  if (error) throw new Error(`unlockTag failed: ${error.message}`);
}

// After one memo's tags changed: lock or open it to match the locked tags.
// Returns the memo's lock as it is now (null: no change).
export async function syncTagLock(userId: string, itemId: string): Promise<{ locked: boolean; locked_by_tag: boolean } | null> {
  const lockedTags = await listLockedTags(userId);
  const { data, error } = await getClient().from("items").select("tags, user_tags, locked, locked_by_tag").eq("id", itemId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`syncTagLock read failed: ${error.message}`);
  if (!data) return null;
  const change = tagLockChange(data as LockState, lockedTags);
  if (!change) return null;
  const { error: upError } = await getClient().from("items").update(change).eq("id", itemId).eq("user_id", userId);
  if (upError) throw new Error(`syncTagLock update failed: ${upError.message}`);
  return change;
}

// Tag cleanup renamed tags: a merged-away locked tag passes its lock on, and
// memos merged into a locked tag get locked.
export async function carryTagLocks(userId: string, rename: Map<string, string>): Promise<void> {
  const locked = new Set(await listLockedTags(userId));
  const keeps = new Set<string>();
  for (const [from, to] of rename) if (locked.has(from) || locked.has(to)) keeps.add(to);
  if (keeps.size === 0) return;
  for (const keep of keeps) await lockTag(userId, keep);
  const gone = [...rename.keys()].filter((t) => locked.has(t));
  if (gone.length === 0) return;
  const { error } = await getClient().from("locked_tags").delete().eq("user_id", userId).in("tag", gone);
  if (error) throw new Error(`carryTagLocks failed: ${error.message}`);
}

// Guest claim: the guest's locked tags join the account's, and every memo
// now on the account follows the account's locked tags.
export async function moveLockedTags(client: SupabaseClient, guestId: string, targetId: string): Promise<{ error: { message: string } | null }> {
  const { data, error } = await client.from("locked_tags").select("tag").eq("user_id", guestId);
  if (error) return { error };
  const rows = (data ?? []).map((r) => ({ user_id: targetId, tag: r.tag as string }));
  if (rows.length) {
    const { error: upError } = await client.from("locked_tags").upsert(rows, { onConflict: "user_id,tag", ignoreDuplicates: true });
    if (upError) return { error: upError };
  }
  const { error: delError } = await client.from("locked_tags").delete().eq("user_id", guestId);
  if (delError) return { error: delError };
  try {
    for (const tag of await listLockedTags(targetId)) await lockMemosWithTag(targetId, tag);
  } catch (err) {
    return { error: { message: err instanceof Error ? err.message : String(err) } };
  }
  return { error: null };
}

// A person flags what the AI wrote for one of their items (Play's
// AI-generated content policy). Keeps a copy of the output as it was.
export async function reportAiOutput(userId: string, itemId: string): Promise<void> {
  const item = await getItemForUser(userId, itemId);
  if (!item) throw new Error("item not found");
  const { error } = await getClient()
    .from("ai_reports")
    .insert({ user_id: userId, item_id: itemId, title: item.title, snippet: item.snippet, tags: item.tags ?? [] });
  if (error) throw new Error(`reportAiOutput failed: ${error.message}`);
}

export async function restoreItem(userId: string, itemId: string): Promise<void> {
  const { error, count } = await getClient()
    .from("items")
    .update({ deleted_at: null }, { count: "exact" })
    .eq("id", itemId)
    .eq("user_id", userId)
    .not("deleted_at", "is", null);
  if (error) throw new Error(`restoreItem failed: ${error.message}`);
  if (!count) throw new Error("item not found in trash");
}

// The real, unrecoverable delete -- only ever called from the trash view,
// on an item that's already been soft-deleted (the .not("deleted_at", "is",
// null) below is what enforces that, not just a UI convention).
export async function permanentlyDeleteItem(userId: string, itemId: string): Promise<void> {
  const client = getClient();

  const { data: item, error: lookupError } = await client
    .from("items")
    .select("image_path")
    .eq("id", itemId)
    .eq("user_id", userId)
    .not("deleted_at", "is", null)
    .maybeSingle();
  if (lookupError) throw new Error(`permanentlyDeleteItem lookup failed: ${lookupError.message}`);
  if (!item) throw new Error("item not found in trash");

  if (item.image_path) {
    await client.storage.from(SCREENSHOTS_BUCKET).remove([item.image_path]);
  }

  const { error } = await client.from("items").delete().eq("id", itemId).eq("user_id", userId);
  if (error) throw new Error(`permanentlyDeleteItem failed: ${error.message}`);
}

export async function listTrash(userId: string): Promise<ItemRecord[]> {
  const { data, error } = await getClient()
    .from("items")
    .select("*")
    .eq("user_id", userId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  if (error) throw new Error(`listTrash failed: ${error.message}`);
  return (data ?? []) as ItemRecord[];
}
