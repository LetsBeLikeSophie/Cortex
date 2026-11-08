// Tags: own and AI tags on an item, tag lists and counts, merging.
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
import { selectAllRows } from "./lists.js";
import { carryTagLocks } from "./lockTrash.js";

async function getUserTags(userId: string, itemId: string): Promise<string[]> {
  const { data, error } = await getClient()
    .from("items")
    .select("user_tags")
    .eq("id", itemId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`getUserTags failed: ${error.message}`);
  if (!data) throw new Error("item not found");
  return data.user_tags as string[];
}

export async function addUserTag(userId: string, itemId: string, tag: string): Promise<ItemRecord> {
  const current = await getUserTags(userId, itemId);
  const next = current.includes(tag) ? current : [...current, tag];

  const { data, error } = await getClient()
    .from("items")
    .update({ user_tags: next })
    .eq("id", itemId)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) throw new Error(`addUserTag failed: ${error.message}`);
  return data as ItemRecord;
}

export async function removeUserTag(userId: string, itemId: string, tag: string): Promise<ItemRecord> {
  const current = await getUserTags(userId, itemId);
  const next = current.filter((t) => t !== tag);

  const { data, error } = await getClient()
    .from("items")
    .update({ user_tags: next })
    .eq("id", itemId)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) throw new Error(`removeUserTag failed: ${error.message}`);
  return data as ItemRecord;
}

async function getAiTags(userId: string, itemId: string): Promise<string[]> {
  const { data, error } = await getClient()
    .from("items")
    .select("tags")
    .eq("id", itemId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`getAiTags failed: ${error.message}`);
  if (!data) throw new Error("item not found");
  return data.tags as string[];
}

// The one write path onto the AI-assigned `tags` column -- removal only.
// Adding a *new* tag still always goes through user_tags (that's what
// keeps "Cortex guessed this" and "I added this" distinguishable); this
// just lets a wrong auto-classification be corrected instead of being
// stuck on the item forever.
export async function removeAiTag(userId: string, itemId: string, tag: string): Promise<ItemRecord> {
  const current = await getAiTags(userId, itemId);
  const next = current.filter((t) => t !== tag);
  // Remembered, so a later re-organize doesn't hand it straight back.
  const { data: row } = await getClient().from("items").select("removed_tags").eq("id", itemId).eq("user_id", userId).maybeSingle();
  const removed = (row?.removed_tags ?? []) as string[];

  const { data, error } = await getClient()
    .from("items")
    .update({ tags: next, removed_tags: removed.includes(tag) ? removed : [...removed, tag] })
    .eq("id", itemId)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) throw new Error(`removeAiTag failed: ${error.message}`);
  return data as ItemRecord;
}

// Distinct tags (both AI-assigned and user-added) across everything this
// user has saved, for the home tab picker's search-as-you-type list.
// PostgREST has no "flatten array column across rows" op, so this fetches
// the (small, personal-archive-scale) tag arrays and flattens them in JS --
// same tradeoff as searchItems below.
export async function listTags(userId: string): Promise<string[]> {
  const rows = await selectAllRows<{ tags: string[]; user_tags: string[] }>(userId, "tags, user_tags", { live: true });
  const set = new Set<string>();
  for (const row of rows) {
    for (const tag of row.tags) set.add(tag);
    for (const tag of row.user_tags) set.add(tag);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "ko"));
}

// How many live items use each tag -- what 태그 정리하기 sends to the AI.
// Locked memos are left out (decision T2): a tag only they carry never
// reaches the AI, the same promise 모아서 만들기 and AI search keep.
export async function listTagCounts(userId: string): Promise<{ name: string; count: number }[]> {
  const rows = await selectAllRows<{ tags: string[]; user_tags: string[] }>(userId, "tags, user_tags", { live: true, unlocked: true });
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const tag of new Set([...row.tags, ...row.user_tags])) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

// Applies the groups the person ticked: every item (trash included, so a
// restore doesn't bring an old name back) gets the merged names replaced
// by keep, in both AI tags and the person's own. Returns items changed.
// What merging each group would do, counted the way mergeTags works:
// `after` = memos in the list (not trashed) that carry the kept tag once
// merged, `changes` = memos mergeTags would rewrite (trash included, since it
// renames there too). Shown before the person ticks anything.
export async function tagGroupCounts(userId: string, groups: { keep: string; merge: string[] }[]): Promise<{ after: number; changes: number }[]> {
  const rows = await selectAllRows<{ tags: string[]; user_tags: string[]; deleted_at: string | null }>(userId, "tags, user_tags, deleted_at");
  return groups.map((g) => {
    const merge = new Set(g.merge.filter((m) => m !== g.keep));
    let after = 0;
    let changes = 0;
    for (const row of rows) {
      const all = [...row.tags, ...row.user_tags];
      const renamed = all.some((t) => merge.has(t));
      if (renamed) changes++;
      if (row.deleted_at === null && (renamed || all.includes(g.keep))) after++;
    }
    return { after, changes };
  });
}

export async function mergeTags(userId: string, groups: { keep: string; merge: string[] }[]): Promise<number> {
  const rename = new Map<string, string>();
  for (const g of groups) for (const m of g.merge) if (m !== g.keep) rename.set(m, g.keep);
  if (rename.size === 0) return 0;
  const rows = await selectAllRows<{ id: string; tags: string[]; user_tags: string[] }>(userId, "id, tags, user_tags");
  const swap = (list: string[]) => [...new Set(list.map((t) => rename.get(t) ?? t))];
  let changed = 0;
  for (const row of rows) {
    if (![...row.tags, ...row.user_tags].some((t) => rename.has(t))) continue;
    const tags = swap(row.tags);
    // A tag the AI already gives it isn't repeated among the person's own.
    const userTags = swap(row.user_tags).filter((t) => !tags.includes(t));
    const { error: upErr } = await getClient().from("items").update({ tags, user_tags: userTags }).eq("id", row.id).eq("user_id", userId);
    if (upErr) throw new Error(`mergeTags update failed: ${upErr.message}`);
    changed++;
  }
  await carryTagLocks(userId, rename);
  return changed;
}

// Everything (not trashed) carrying this tag, AI-assigned or added by the
// person, newest first -- the input to "모아서 만들기". Filtered in JS, like
// listTags, rather than building a PostgREST array filter from free text.
// The person's own items by id, not trashed, in newest-first order -- the
// picked materials of a 모아서 만들기, or a composed memo's sources.
export async function listItemsByIds(userId: string, ids: string[]): Promise<ItemRecord[]> {
  if (ids.length === 0) return [];
  const { data, error } = await getClient()
    .from("items")
    .select()
    .eq("user_id", userId)
    .in("id", ids)
    .is("deleted_at", null)
    .order("shared_at", { ascending: false });
  if (error) throw new Error(`listItemsByIds failed: ${error.message}`);
  return (data ?? []) as ItemRecord[];
}

export async function listItemsWithTag(userId: string, tag: string, max = 50, before?: string): Promise<ItemRecord[]> {
  const inColumn = async (column: "tags" | "user_tags") => {
    let query = getClient().from("items").select().eq("user_id", userId).is("deleted_at", null).contains(column, tagArrayLiteral(tag));
    if (before) query = query.lte("shared_at", before);
    const { data, error } = await query.order("shared_at", { ascending: false }).limit(max);
    if (error) throw new Error(`listItemsWithTag failed: ${error.message}`);
    return (data ?? []) as ItemRecord[];
  };
  const [ai, mine] = await Promise.all([inColumn("tags"), inColumn("user_tags")]);
  return newestOfBoth(ai, mine, max);
}

// The tags this person uses most (AI + their own), most-used first -- fed to
// the classifier so a new item reuses "수달" instead of minting "수달 캐릭터"
// next to it. Capped so the prompt stays small. Locked memos' tags (often
// names) stay out of the prompt.
export async function listFrequentTags(userId: string, max = 150): Promise<string[]> {
  const { data, error } = await getClient()
    .from("items")
    .select("tags, user_tags")
    .eq("user_id", userId)
    .eq("locked", false)
    .is("deleted_at", null)
    .order("shared_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(`listFrequentTags failed: ${error.message}`);
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { tags: string[]; user_tags: string[] }[]) {
    for (const tag of [...row.tags, ...row.user_tags]) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([tag]) => tag);
}
