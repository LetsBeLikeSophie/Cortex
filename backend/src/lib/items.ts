// Item rows: types, insert, classification state, single-item reads.
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

export type ItemSource = "instagram" | "kakaotalk" | "safari" | "youtube" | "memo" | "other";
export type ItemCaptureType = "link" | "text" | "screenshot";
// 'pending' -> inserted, classification still running in the background.
// 'done' -> title/snippet/category/tags are the real classification result.
// 'failed' -> classification errored out; the row keeps its placeholder
// title/category/tags rather than disappearing, so it still shows up and
// can be opened/retagged by hand.
// 'unclassified' -> saved past the month's AI classification quota: no
// Claude call was made; it waits in the app's 미분류함 until it's
// classified later (see classifyStoredItem in pipeline.ts).
export type ClassificationStatus = "pending" | "done" | "failed" | "unclassified";
export type UnclassifiedReason = "quota" | "failed" | "consent";

export interface ItemRecord {
  id: string;
  user_id: string;
  source: ItemSource;
  capture_type: ItemCaptureType;
  raw_url: string | null;
  raw_text: string | null;
  image_path: string | null;
  thumbnail_url: string | null;
  title: string | null;
  snippet: string | null;
  category: Category;
  tags: string[]; // AI-assigned, read-only from the client
  user_tags: string[]; // user-added, freely add/removable
  user_note: string | null; // optional "why I saved this", set at save time
  classification_status: ClassificationStatus;
  // Why it's in 미분류함: the month's quota ran out, or the AI failed on it
  // (null when not unclassified, and on rows from before 2026-10-23).
  unclassified_reason?: UnclassifiedReason | null;
  // AI tags the person removed -- a re-organize never puts them back.
  removed_tags?: string[];
  // A 모아서 만들기 memo: the items it was made from.
  composed_from?: string[] | null;
  // Opens only with the device PIN; left out of AI search and compose.
  locked?: boolean;
  // Locked because it carries a locked tag (lib/tagLock.ts).
  locked_by_tag?: boolean;
  shared_at: string;
  created_at: string;
  deleted_at: string | null;
}

export interface NewItem {
  userId: string;
  source: ItemSource;
  captureType: ItemCaptureType;
  rawUrl?: string;
  rawText?: string;
  imagePath?: string;
  thumbnailUrl?: string;
  title?: string;
  snippet?: string;
  category: Category;
  tags: string[];
  userNote?: string;
  // Required (not defaulted) so every call site has to say explicitly
  // whether it's inserting a placeholder awaiting classification or a
  // fully-classified row (e.g. seedSampleItem, which never goes through
  // the async pipeline at all).
  classificationStatus: ClassificationStatus;
  unclassifiedReason?: UnclassifiedReason;
  composedFrom?: string[];
  // The app's id for this save (see findItemByRequestId).
  clientRequestId?: string;
}

// The same save sent twice -- the unique index on (user_id,
// client_request_id) refused the second row.
export class DuplicateRequestError extends Error {
  constructor() {
    super("duplicate client_request_id");
  }
}

// The item an earlier try of this save already made, if any. undefined
// (not null) when the database has no client_request_id column yet
// (migration 2026-10-27-save-request-id.sql not run): saving then goes on
// without the check, as before.
export async function findItemByRequestId(userId: string, requestId: string): Promise<ItemRecord | null | undefined> {
  const { data, error } = await getClient().from("items").select().eq("user_id", userId).eq("client_request_id", requestId).maybeSingle();
  if (error) {
    if (error.code === "42703" || /client_request_id/.test(error.message)) return undefined;
    throw new Error(`findItemByRequestId failed: ${error.message}`);
  }
  return (data as ItemRecord | null) ?? null;
}

export async function insertItem(item: NewItem): Promise<ItemRecord> {
  const { data, error } = await getClient()
    .from("items")
    .insert({
      user_id: item.userId,
      source: item.source,
      capture_type: item.captureType,
      raw_url: item.rawUrl ?? null,
      raw_text: item.rawText ?? null,
      image_path: item.imagePath ?? null,
      thumbnail_url: item.thumbnailUrl ?? null,
      title: item.title ?? null,
      snippet: item.snippet ?? null,
      category: item.category,
      tags: item.tags,
      user_note: item.userNote ?? null,
      classification_status: item.classificationStatus,
      ...(item.unclassifiedReason ? { unclassified_reason: item.unclassifiedReason } : null),
      ...(item.composedFrom ? { composed_from: item.composedFrom } : null),
      ...(item.clientRequestId ? { client_request_id: item.clientRequestId } : null),
    })
    .select()
    .single();

  if (error?.code === "23505" && item.clientRequestId) throw new DuplicateRequestError();
  if (error) throw new Error(`insertItem failed: ${error.message}`);
  return data as ItemRecord;
}

// Called once the background classification call resolves (pipeline.ts) --
// fills in the real title/snippet/category/tags and flips the row to
// 'done'. Scoped to (id, user_id) like every other per-item write here,
// even though this only ever runs with an id this same request just
// created, for the same defense-in-depth reason the rest of this file
// does it.
export async function completeClassification(
  itemId: string,
  userId: string,
  classification: { title: string; snippet: string; category: Category; tags: string[]; keyText?: string; hasText?: boolean },
  // Links only -- fetched by the same background metadata call that feeds
  // classifyText, so it lands here rather than as a separate write.
  thumbnailUrl?: string
): Promise<void> {
  const { title, snippet, category, keyText, hasText } = classification;
  // An AI tag the person already has on the item as their own would show as
  // two chips (faint + solid) and outlive removing either one -- read their
  // tags fresh (they may have added one while this ran) and drop repeats.
  // Same for an AI tag they removed before (decision Q4): it stays gone.
  const { data: current } = await getClient().from("items").select("user_tags, removed_tags").eq("id", itemId).eq("user_id", userId).maybeSingle();
  const own = new Set([...((current?.user_tags ?? []) as string[]), ...((current?.removed_tags ?? []) as string[])].map((t) => t.toLowerCase()));
  const tags = classification.tags.filter((t) => !own.has(t.toLowerCase()));
  const { error } = await getClient()
    .from("items")
    .update({
      title,
      snippet,
      category,
      tags,
      unclassified_reason: null,
      ...(thumbnailUrl ? { thumbnail_url: thumbnailUrl } : null),
      // A screenshot has no raw_text of its own; the words Claude read off
      // it go there so search (matchesTerm checks raw_text) can find the
      // image by a word that was in it. The app only renders raw_text as
      // the body for text items, so this stays invisible otherwise.
      ...(keyText?.trim() ? { raw_text: keyText.trim() } : null),
      // Screenshots only (undefined for links/text): does the image carry
      // readable text. Kept as data for search, never shown.
      ...(hasText !== undefined ? { has_text: hasText } : null),
      classification_status: "done" satisfies ClassificationStatus,
    })
    .eq("id", itemId)
    .eq("user_id", userId);
  if (error) throw new Error(`completeClassification failed: ${error.message}`);
}

// Classification threw (Claude error, timeout, etc.) -- leave the
// placeholder title/category/tags in place (still a real, openable item)
// and just flip the status so the client stops showing "분석 중".
export async function failClassification(itemId: string, userId: string): Promise<void> {
  const { error } = await getClient()
    .from("items")
    .update({ classification_status: "failed" satisfies ClassificationStatus })
    .eq("id", itemId)
    .eq("user_id", userId);
  if (error) throw new Error(`failClassification failed: ${error.message}`);
}

// Flips a row to 'pending' just before a deferred (미분류함) classification
// starts, so the app shows it as "분석 중" like a fresh save.
export async function markClassificationPending(itemId: string, userId: string): Promise<void> {
  const { error } = await getClient()
    .from("items")
    .update({ classification_status: "pending" satisfies ClassificationStatus, unclassified_reason: null })
    .eq("id", itemId)
    .eq("user_id", userId);
  if (error) throw new Error(`markClassificationPending failed: ${error.message}`);
}

// Classification gave up after every retry: park the item in 미분류함
// (still a real, openable item) so "AI로 정리" can try it again later.
export async function markUnclassified(itemId: string, userId: string, reason: UnclassifiedReason | null = "failed"): Promise<void> {
  const { error } = await getClient()
    .from("items")
    .update({ classification_status: "unclassified" satisfies ClassificationStatus, unclassified_reason: reason })
    .eq("id", itemId)
    .eq("user_id", userId);
  if (error) throw new Error(`markUnclassified failed: ${error.message}`);
}

// Every user's items still at 'pending' -- for re-queueing at startup.
export async function listPendingItems(limit: number): Promise<ItemRecord[]> {
  const { data, error } = await getClient()
    .from("items")
    .select()
    .eq("classification_status", "pending")
    .order("shared_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`listPendingItems failed: ${error.message}`);
  return (data ?? []) as ItemRecord[];
}

// The person's own edits from the detail screen. null clears a field.
export async function updateItemText(
  userId: string,
  itemId: string,
  patch: {
    title?: string | null;
    snippet?: string | null;
    rawText?: string | null;
    userNote?: string | null;
    category?: Category;
    tags?: string[];
  }
): Promise<ItemRecord> {
  const { data, error } = await getClient()
    .from("items")
    .update({
      ...(patch.title !== undefined ? { title: patch.title } : null),
      ...(patch.snippet !== undefined ? { snippet: patch.snippet } : null),
      ...(patch.rawText !== undefined ? { raw_text: patch.rawText } : null),
      ...(patch.userNote !== undefined ? { user_note: patch.userNote } : null),
      ...(patch.category !== undefined ? { category: patch.category } : null),
      ...(patch.tags !== undefined ? { tags: patch.tags } : null),
    })
    .eq("id", itemId)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) throw new Error(`updateItemText failed: ${error.message}`);
  return data as ItemRecord;
}

export async function getItemForUser(userId: string, itemId: string): Promise<ItemRecord | null> {
  const { data, error } = await getClient().from("items").select().eq("id", itemId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`getItemForUser failed: ${error.message}`);
  return (data as ItemRecord | null) ?? null;
}

// Oldest first, so "AI로 정리" clears the backlog in the order it piled up.
export async function listUnclassifiedItems(userId: string, limit: number, before?: string): Promise<ItemRecord[]> {
  let query = getClient()
    .from("items")
    .select()
    .eq("user_id", userId)
    .eq("classification_status", "unclassified")
    .is("deleted_at", null);
  if (before) query = query.lte("shared_at", before);
  // Newest first: what was just saved is what people look for next, so
  // 'AI로 정리' (classifyBacklog) spends the month's allowance there first.
  const { data, error } = await query.order("shared_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`listUnclassifiedItems failed: ${error.message}`);
  return (data ?? []) as ItemRecord[];
}

// What "AI로 정리" may send to the AI: the 미분류함 minus locked memos
// (a locked memo stays away from the AI, decision T2). The tab itself still
// lists locked ones (listUnclassifiedItems).
export async function listBacklogItems(userId: string, limit: number): Promise<ItemRecord[]> {
  const { data, error } = await getClient()
    .from("items")
    .select()
    .eq("user_id", userId)
    .eq("classification_status", "unclassified")
    .eq("locked", false)
    .is("deleted_at", null)
    .order("shared_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listBacklogItems failed: ${error.message}`);
  return (data ?? []) as ItemRecord[];
}

export async function countBacklog(userId: string): Promise<number> {
  const { count, error } = await getClient()
    .from("items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("classification_status", "unclassified")
    .eq("locked", false)
    .is("deleted_at", null);
  if (error) throw new Error(`countBacklog failed: ${error.message}`);
  return count ?? 0;
}

// Flips the picked 미분류 rows to 'pending' in a few calls, not one per row.
// Only rows that were still waiting (and still unlocked) come back -- a row
// another run already took isn't returned, so it's never queued twice.
export async function markBacklogPending(userId: string, ids: string[]): Promise<ItemRecord[]> {
  const flipped: ItemRecord[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await getClient()
      .from("items")
      .update({ classification_status: "pending" satisfies ClassificationStatus, unclassified_reason: null })
      .eq("user_id", userId)
      .in("id", ids.slice(i, i + 100))
      .eq("classification_status", "unclassified")
      .eq("locked", false)
      .is("deleted_at", null)
      .select();
    if (error) throw new Error(`markBacklogPending failed: ${error.message}`);
    flipped.push(...((data ?? []) as ItemRecord[]));
  }
  return flipped;
}

// The queue's last look at a row before it goes to the AI: it may have been
// locked or trashed since it was queued. null: the row is gone.
export async function getClassifyGate(itemId: string): Promise<{ locked: boolean; deleted: boolean } | null> {
  const { data, error } = await getClient().from("items").select("locked, deleted_at").eq("id", itemId).maybeSingle();
  if (error) throw new Error(`getClassifyGate failed: ${error.message}`);
  if (!data) return null;
  return { locked: !!data.locked, deleted: data.deleted_at !== null };
}

// Reads a stored screenshot back -- needed to classify one that was saved
// unclassified (the original upload bytes are long gone by then).
export async function downloadScreenshot(imagePath: string): Promise<Buffer> {
  const { data, error } = await getClient().storage.from(SCREENSHOTS_BUCKET).download(imagePath);
  if (error || !data) throw new Error(`downloadScreenshot failed: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}
