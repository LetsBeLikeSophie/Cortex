// Item lists: home, export, lookback.
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
import { ItemRecord } from "./items.js";

export interface ListItemsOptions {
  limit?: number;
  // The next page: this time and older. Includes the time itself, since two
  // rows can share one; the app drops the repeat.
  before?: string;
}

export async function listItems(userId: string, options: ListItemsOptions = {}): Promise<{ items: ItemRecord[]; total: number }> {
  let query = getClient().from("items").select("*", { count: "exact" }).eq("user_id", userId).is("deleted_at", null);
  if (options.before) query = query.lte("shared_at", options.before);
  const { data, error, count } = await query.order("shared_at", { ascending: false }).limit(options.limit ?? 30);

  if (error) throw new Error(`listItems failed: ${error.message}`);
  return { items: (data ?? []) as ItemRecord[], total: count ?? 0 };
}

// Everything not in the trash, newest first, for 메모 내보내기 (decision B1).
// Pages through PostgREST's 1000-row cap; stops at `max` as a guard.
// What 메모 내보내기 writes out -- not embeddings, image paths or the rest.
const EXPORT_COLUMNS = "id, title, shared_at, source, category, tags, user_tags, capture_type, raw_text, snippet, raw_url, user_note, locked";

export async function listAllItems(userId: string, max = 20000): Promise<ItemRecord[]> {
  const out: ItemRecord[] = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await getClient()
      .from("items")
      .select(EXPORT_COLUMNS)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("shared_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`listAllItems failed: ${error.message}`);
    out.push(...((data ?? []) as ItemRecord[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

// Up to `n` memos saved over 30 days ago, with a title and not locked, for
// the weekly '다시 보기' reminder: picked at random from the newest 300.
export async function listLookback(userId: string, n: number): Promise<{ id: string; title: string }[]> {
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await getClient()
    .from("items")
    .select("id, title")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .eq("locked", false)
    .not("title", "is", null)
    .lt("shared_at", monthAgo)
    .order("shared_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(`listLookback failed: ${error.message}`);
  const rows = ((data ?? []) as { id: string; title: string }[]).filter((r) => r.title.trim());
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  return rows.slice(0, n);
}

// PostgREST stops a select at 1000 rows, so a scan of a person's archive
// (tags, stats) reads it in id order a page at a time, to the end. Only the
// asked-for columns come back, so even a big archive stays small in memory.
export async function selectAllRows<T>(
  userId: string,
  columns: string,
  only: { live?: boolean; unlocked?: boolean } = {},
  max = 50000
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += 1000) {
    let q = getClient().from("items").select(columns).eq("user_id", userId);
    if (only.live) q = q.is("deleted_at", null);
    if (only.unlocked) q = q.eq("locked", false);
    const { data, error } = await q.order("id", { ascending: true }).range(from, from + 999);
    if (error) throw new Error(`selectAllRows failed: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}
