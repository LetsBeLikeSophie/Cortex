// Kakao id links and the 30-day hold after a Kakao disconnect.
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
import { getClient } from "./db.js";

// One indexed row lookup instead of paging through every account -- see
// kakao_users in db/schema.sql for why this table exists at all.
export async function findUserIdByKakaoId(kakaoId: number): Promise<string | null> {
  const { data, error } = await getClient()
    .from("kakao_users")
    .select("user_id")
    .eq("kakao_id", String(kakaoId))
    .maybeSingle();
  if (error) throw new Error(`findUserIdByKakaoId failed: ${error.message}`);
  return data?.user_id ?? null;
}

// Unlinked from Kakao's side (their Kakao settings): the account is held 30
// days, then deleted by the retention job (decision K1). Logging in with the
// same Kakao account in between clears it (see kakaoAuth.ts).
export const KAKAO_UNLINK_HOLD_DAYS = 30;

export async function isKakaoUnlinked(kakaoId: number): Promise<boolean> {
  const { data, error } = await getClient().from("kakao_users").select("unlinked_at").eq("kakao_id", String(kakaoId)).maybeSingle();
  if (error) throw new Error(`isKakaoUnlinked failed: ${error.message}`);
  return !!data?.unlinked_at;
}

// Upsert: an account older than kakao_users (found by its email) gets its
// row here, already marked.
export async function markKakaoUnlinked(kakaoId: number, userId: string): Promise<void> {
  const { error } = await getClient()
    .from("kakao_users")
    .upsert({ kakao_id: String(kakaoId), user_id: userId, unlinked_at: new Date().toISOString() }, { onConflict: "kakao_id" });
  if (error) throw new Error(`markKakaoUnlinked failed: ${error.message}`);
}

export async function clearKakaoUnlinked(kakaoId: number): Promise<void> {
  const { error } = await getClient().from("kakao_users").update({ unlinked_at: null }).eq("kakao_id", String(kakaoId));
  if (error) throw new Error(`clearKakaoUnlinked failed: ${error.message}`);
}

// Oldest first; `skip` is accounts that already failed in this run.
export async function listExpiredKakaoUnlinks(skip: string[] = [], limit = 100): Promise<string[]> {
  const cutoff = new Date(Date.now() - KAKAO_UNLINK_HOLD_DAYS * 24 * 60 * 60 * 1000).toISOString();
  let query = getClient().from("kakao_users").select("user_id").lt("unlinked_at", cutoff);
  if (skip.length > 0) query = query.not("user_id", "in", `(${skip.join(",")})`);
  const { data, error } = await query.order("unlinked_at", { ascending: true }).limit(limit);
  if (error) throw new Error(`listExpiredKakaoUnlinks failed: ${error.message}`);
  return (data ?? []).map((r: { user_id: string }) => r.user_id);
}

export async function linkKakaoUser(kakaoId: number, userId: string): Promise<void> {
  const { error } = await getClient().from("kakao_users").insert({ kakao_id: String(kakaoId), user_id: userId });
  if (error) throw new Error(`linkKakaoUser failed: ${error.message}`);
}
