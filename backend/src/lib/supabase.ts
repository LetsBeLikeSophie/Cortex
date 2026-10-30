import { createHmac } from "node:crypto";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config, required } from "../config.js";
import { Category } from "./categories.js";
import type { SearchInterpretation } from "./anthropic.js";
import { SOURCE_CATALOG, CAPTURE_TYPE_CATALOG } from "./sourceCatalog.js";

const SCREENSHOTS_BUCKET = "item-screenshots";

let client: SupabaseClient | null = null;

// Lazy singleton so the server can boot (and e.g. serve /health, or exercise
// the metadata fetcher) even before Supabase credentials are configured --
// only routes that actually touch the DB pay for the missing-config error.
export function getClient(): SupabaseClient {
  if (!client) {
    client = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"));
  }
  return client;
}

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
export async function listUnclassifiedItems(userId: string, limit: number): Promise<ItemRecord[]> {
  const { data, error } = await getClient()
    .from("items")
    .select()
    .eq("user_id", userId)
    .eq("classification_status", "unclassified")
    .is("deleted_at", null)
    // Newest first: what was just saved is what people look for next, so
    // 'AI로 정리' (classifyBacklog) spends the month's allowance there first.
    .order("shared_at", { ascending: false })
    .limit(limit);
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

// One real, deletable/editable example item so a brand-new account isn't a
// totally blank slate -- the home list has something to show, and the tag
// picker (which searches actual saved tags) has something to find. Shared
// by both the Kakao signup path (kakaoAuth.ts) and the guest/anonymous
// signup path (POST /auth/seed-sample) so neither one starts emptier than
// the other. Doubles as onboarding: it's written to explain the app's own
// share -> auto-tag -> search loop through an item that demonstrates it,
// rather than a generic placeholder unrelated to what a first-time opener
// actually needs to know. Best-effort at each call site: a seeding hiccup
// shouldn't block signup.
// The guide memo in the person's language (X-Cortex-Lang); Korean when
// unknown, since Kakao sign-ups don't send it.
const SAMPLES: Record<"ko" | "en" | "ja" | "zh-Hans" | "zh-Hant", { title: string; snippet: string; tags: string[]; text: string }> = {
  ko: {
    title: "저장 눌렀는데 어디로 갔지?",
    snippet: "Cortex 사용법 안내",
    tags: ["가이드", "첫기억"],
    text:
      "인스타 게시물이든, 유튜브 링크든, 캡처한 스크린샷이든 공유 버튼을 눌러 Cortex를 고르면 끝이에요. " +
      "제목과 태그는 AI가 붙여요. 사진이나 링크에는 왜 저장했는지 내 메모를 말로 남겨도 돼요. " +
      "나중에 찾을 땐 검색창에 단어를 치면 바로 나오고, 기억이 흐릿하면 문장으로 쓰고 ✦를 누르세요. " +
      "이 메모는 지워도 되고, 첫 기억으로 둬도 돼요.",
  },
  en: {
    title: "Saved it, but where did it go?",
    snippet: "How to use Cortex",
    tags: ["guide", "first memory"],
    text:
      "Whether it's an Instagram post, a YouTube link or a screenshot, tap Share and pick Cortex. That's it. " +
      "AI adds the title and tags. For a photo or a link, you can also say why you saved it as your own note. " +
      "To find it later, type a word in search; if your memory is fuzzy, write a sentence and tap ✦. " +
      "You can delete this note or keep it as your first memory.",
  },
  ja: {
    title: "保存したのに、どこへ行った？",
    snippet: "Cortexの使い方",
    tags: ["ガイド", "はじめての記録"],
    text:
      "Instagramの投稿でも、YouTubeのリンクでも、スクリーンショットでも、共有ボタンからCortexを選べば完了です。" +
      "タイトルとタグはAIが付けます。写真やリンクには、なぜ保存したかを声でメモしても大丈夫です。" +
      "あとで探すときは検索欄に単語を入れればすぐ見つかります。記憶があいまいなら文章で書いて✦を押してください。" +
      "このメモは消しても、最初の記録として残してもかまいません。",
  },
  "zh-Hans": {
    title: "点了保存，跑哪儿去了？",
    snippet: "Cortex 使用说明",
    tags: ["指南", "第一条记录"],
    text:
      "无论是 Instagram 帖子、YouTube 链接还是截图，点分享并选择 Cortex 就完成了。" +
      "标题和标签由 AI 添加。照片或链接还可以用语音留下保存的原因。" +
      "以后要找时，在搜索框输入词语就能找到；记不清时就写一句话，再点 ✦。" +
      "这条笔记可以删除，也可以留作你的第一条记录。",
  },
  "zh-Hant": {
    title: "按了儲存，跑去哪了？",
    snippet: "Cortex 使用說明",
    tags: ["指南", "第一筆記錄"],
    text:
      "無論是 Instagram 貼文、YouTube 連結還是截圖，點分享並選擇 Cortex 就完成了。" +
      "標題和標籤由 AI 加上。照片或連結還可以用語音留下儲存的原因。" +
      "之後要找時，在搜尋框輸入字詞就能找到；記不清時就寫一句話，再點 ✦。" +
      "這則筆記可以刪除，也可以留作你的第一筆記錄。",
  },
};
export const SAMPLE_TITLES = Object.values(SAMPLES).map((s) => s.title);

function sampleFor(lang: string | null | undefined) {
  const l = (lang ?? "ko").toLowerCase();
  if (l.startsWith("ko")) return SAMPLES.ko;
  if (l.startsWith("ja")) return SAMPLES.ja;
  if (l.startsWith("zh")) return /hant|-tw|-hk|-mo/.test(l) ? SAMPLES["zh-Hant"] : SAMPLES["zh-Hans"];
  return SAMPLES.en;
}

export async function seedSampleItem(userId: string, lang?: string | null): Promise<void> {
  const sample = sampleFor(lang);
  await insertItem({
    userId,
    source: "memo",
    captureType: "text",
    rawText: sample.text,
    title: sample.title,
    snippet: sample.snippet,
    category: "기억할 것",
    tags: sample.tags,
    classificationStatus: "done",
  });
}

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

export async function setItemLocked(userId: string, itemId: string, locked: boolean): Promise<void> {
  const { error, count } = await getClient()
    .from("items")
    .update({ locked }, { count: "exact" })
    .eq("id", itemId)
    .eq("user_id", userId);
  if (error) throw new Error(`setItemLocked failed: ${error.message}`);
  if (!count) throw new Error("item not found");
}

// Turning the memo lock off (the PIN is gone) opens every locked memo.
export async function unlockAllItems(userId: string): Promise<number> {
  const { error, count } = await getClient().from("items").update({ locked: false }, { count: "exact" }).eq("user_id", userId).eq("locked", true);
  if (error) throw new Error(`unlockAllItems failed: ${error.message}`);
  return count ?? 0;
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

export interface ListItemsOptions {
  limit?: number;
}

export async function listItems(userId: string, options: ListItemsOptions = {}): Promise<{ items: ItemRecord[]; total: number }> {
  const { data, error, count } = await getClient()
    .from("items")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("shared_at", { ascending: false })
    .limit(options.limit ?? 30);

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

// Distinct tags (both AI-assigned and user-added) across everything this
// user has saved, for the home tab picker's search-as-you-type list.
// PostgREST has no "flatten array column across rows" op, so this fetches
// the (small, personal-archive-scale) tag arrays and flattens them in JS --
// same tradeoff as searchItems below.
export async function listTags(userId: string): Promise<string[]> {
  const { data, error } = await getClient()
    .from("items")
    .select("tags, user_tags")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .limit(2000);
  if (error) throw new Error(`listTags failed: ${error.message}`);

  const set = new Set<string>();
  for (const row of (data ?? []) as { tags: string[]; user_tags: string[] }[]) {
    for (const tag of row.tags) set.add(tag);
    for (const tag of row.user_tags) set.add(tag);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "ko"));
}

// How many live items use each tag -- what 태그 정리하기 sends to the AI.
// Locked memos are left out (decision T2): a tag only they carry never
// reaches the AI, the same promise 모아서 만들기 and AI search keep.
export async function listTagCounts(userId: string): Promise<{ name: string; count: number }[]> {
  const { data, error } = await getClient()
    .from("items")
    .select("tags, user_tags")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .eq("locked", false)
    .limit(2000);
  if (error) throw new Error(`listTagCounts failed: ${error.message}`);
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { tags: string[]; user_tags: string[] }[]) {
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
  const { data, error } = await getClient().from("items").select("tags, user_tags, deleted_at").eq("user_id", userId).limit(5000);
  if (error) throw new Error(`tagGroupCounts failed: ${error.message}`);
  const rows = (data ?? []) as { tags: string[]; user_tags: string[]; deleted_at: string | null }[];
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
  const { data, error } = await getClient().from("items").select("id, tags, user_tags").eq("user_id", userId).limit(5000);
  if (error) throw new Error(`mergeTags read failed: ${error.message}`);
  const swap = (list: string[]) => [...new Set(list.map((t) => rename.get(t) ?? t))];
  let changed = 0;
  for (const row of (data ?? []) as { id: string; tags: string[]; user_tags: string[] }[]) {
    if (![...row.tags, ...row.user_tags].some((t) => rename.has(t))) continue;
    const tags = swap(row.tags);
    // A tag the AI already gives it isn't repeated among the person's own.
    const userTags = swap(row.user_tags).filter((t) => !tags.includes(t));
    const { error: upErr } = await getClient().from("items").update({ tags, user_tags: userTags }).eq("id", row.id).eq("user_id", userId);
    if (upErr) throw new Error(`mergeTags update failed: ${upErr.message}`);
    changed++;
  }
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

export async function listItemsWithTag(userId: string, tag: string, max = 50): Promise<ItemRecord[]> {
  const { data, error } = await getClient()
    .from("items")
    .select()
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("shared_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(`listItemsWithTag failed: ${error.message}`);
  return ((data ?? []) as ItemRecord[]).filter((it) => it.tags.includes(tag) || it.user_tags.includes(tag)).slice(0, max);
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

// PostgREST's `or=()` logic-tree parser doesn't accept a `column::cast`
// inside a grouped filter, so `tags::text.ilike...` can't sit alongside the
// other ilike clauses there (see db/schema.sql's tsvector index --
// `.textSearch` against that is the real fix once search quality/volume
// demands it). For v1, filter tags in JS instead: fetch a generous window
// for this user and match title/snippet/raw_text/tags here.
// Deliberately searches trashed items too (unlike listItems/getStats/
// listTags) -- something you trashed a while back is exactly the kind of
// thing you'd go looking for by name rather than find by browsing, and the
// alternative (silently excluding it) reads as "search is broken" rather
// than "working as designed." The route marks matches by their deleted_at
// so the client can badge/offer-restore instead of opening them normally.
function matchesTerm(item: ItemRecord, needle: string): boolean {
  if (item.title?.toLowerCase().includes(needle)) return true;
  if (item.snippet?.toLowerCase().includes(needle)) return true;
  if (item.raw_text?.toLowerCase().includes(needle)) return true;
  // The user's own "why I saved this" note -- a stronger search clue than
  // an AI tag since it's in their own words, so it's checked the same way.
  if (item.user_note?.toLowerCase().includes(needle)) return true;
  if (item.tags.some((tag) => tag.toLowerCase().includes(needle))) return true;
  if (item.user_tags.some((tag) => tag.toLowerCase().includes(needle))) return true;
  // The channel/method chips shown in the app aren't stored as tags, but
  // they're presented like tags there -- searching "유튜브" or "링크"
  // should find everything tagged with that channel/method too.
  const source = SOURCE_CATALOG[item.source];
  if (source.label.toLowerCase().includes(needle) || source.labelEn.includes(needle)) return true;
  const captureType = CAPTURE_TYPE_CATALOG[item.capture_type];
  if (captureType.label.toLowerCase().includes(needle) || captureType.labelEn.includes(needle)) return true;
  return false;
}

// `include` terms are AND'd together (an item must match every one),
// `exclude` terms are NOT'd (an item matching any one is dropped) -- the
// search screen's tag chips map straight onto these two lists.
export async function searchItems(
  userId: string,
  include: string[],
  exclude: string[],
  limit = 30,
  // Tag chips: exact tag match (case-insensitive), applied before the limit.
  tags: string[] = [],
  excludeTags: string[] = []
): Promise<ItemRecord[]> {
  const { data, error } = await getClient()
    .from("items")
    .select()
    .eq("user_id", userId)
    .order("shared_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(`searchItems failed: ${error.message}`);

  const inc = include.map((w) => w.toLowerCase()).filter(Boolean);
  const exc = exclude.map((w) => w.toLowerCase()).filter(Boolean);

  const tagInc = tags.map((t) => t.toLowerCase()).filter(Boolean);
  const tagExc = excludeTags.map((t) => t.toLowerCase()).filter(Boolean);
  const hasTag = (item: ItemRecord, tag: string) => [...item.tags, ...item.user_tags].some((t) => t.toLowerCase() === tag);

  const matches = (data ?? []).filter((item: ItemRecord) => {
    if (exc.some((needle) => matchesTerm(item, needle))) return false;
    if (tagExc.some((tag) => hasTag(item, tag))) return false;
    if (!tagInc.every((tag) => hasTag(item, tag))) return false;
    return inc.every((needle) => matchesTerm(item, needle));
  });

  return matches.slice(0, limit) as ItemRecord[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface SmartSearchResult {
  items: (ItemRecord & { matched_count: number })[];
  // Only set when the filters left nothing: how many items the same
  // keywords find with every filter dropped, so the client can say
  // "조건을 빼면 N건" instead of a dead-end "결과 없음".
  relaxed_count: number | null;
}

// The natural-language search's query runner -- also called directly
// (no LLM) when the user edits the interpreted chips. Filters narrow in the
// DB query itself; keywords are OR'd within a group (term + synonyms) and
// only rank across groups: an item matching 1 of 3 remembered keywords
// still shows, just below one matching all 3, since half-remembering is
// the whole premise here (unlike searchItems' strict AND for typed chips).
export async function searchItemsSmart(
  userId: string,
  q: SearchInterpretation,
  limit = 30
): Promise<SmartSearchResult> {
  const groups = q.keywords
    .map((k) => [k.term, ...k.synonyms].map((w) => w.toLowerCase().trim()).filter(Boolean))
    .filter((g) => g.length > 0);
  const exc = q.exclude.map((w) => w.toLowerCase().trim()).filter(Boolean);
  const hasFilter = !!(q.source || q.captureType || q.category || q.dateFrom || q.dateTo);

  const run = async (withFilters: boolean) => {
    let query = getClient().from("items").select().eq("user_id", userId);
    if (withFilters) {
      if (q.source) query = query.eq("source", q.source);
      if (q.captureType) query = query.eq("capture_type", q.captureType);
      if (q.category) query = query.eq("category", q.category);
      // Dates come in as Korea-time calendar days; shared_at is UTC.
      if (q.dateFrom && DATE_RE.test(q.dateFrom)) query = query.gte("shared_at", `${q.dateFrom}T00:00:00+09:00`);
      if (q.dateTo && DATE_RE.test(q.dateTo)) query = query.lte("shared_at", `${q.dateTo}T23:59:59.999+09:00`);
    }
    // "가장 오래된 ..." asks for the start of the archive, not the latest 500.
    const oldestFirst = q.sort === "oldest";
    const { data, error } = await query.order("shared_at", { ascending: oldestFirst }).limit(500);
    if (error) throw new Error(`searchItemsSmart failed: ${error.message}`);

    return ((data ?? []) as ItemRecord[])
      .filter((item) => !exc.some((needle) => matchesTerm(item, needle)))
      .map((item) => ({
        ...item,
        matched_count: groups.filter((g) => g.some((needle) => matchesTerm(item, needle))).length,
      }))
      // No keywords at all ("지난달 인스타에서 저장한 거") means the filters
      // alone are the query -- everything they let through counts.
      .filter((item) => groups.length === 0 || item.matched_count > 0)
      // Stable sort, so equal scores keep the query's date order. An
      // explicit order (oldest/newest) wins outright: it was asked for.
      .sort((a, b) => (q.sort ? 0 : b.matched_count - a.matched_count));
  };

  const items = await run(true);
  const relaxed_count = items.length === 0 && hasFilter && groups.length > 0 ? (await run(false)).length : null;
  return { items: items.slice(0, limit), relaxed_count };
}

// Uploads a screenshot capture to Supabase Storage and returns its storage
// path (not a public URL -- generate a signed URL when actually serving it).
export async function uploadScreenshot(userId: string, bytes: Buffer, contentType: string): Promise<string> {
  const ext = contentType.split("/")[1] ?? "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await getClient().storage.from(SCREENSHOTS_BUCKET).upload(path, bytes, {
    contentType,
    upsert: false,
  });

  if (error) throw new Error(`uploadScreenshot failed: ${error.message}`);
  return path;
}

export async function countItemsSince(userId: string, sinceIso: string): Promise<number> {
  const { count, error } = await getClient()
    .from("items")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", sinceIso);

  if (error) throw new Error(`countItemsSince failed: ${error.message}`);
  return count ?? 0;
}

// Saved (not trashed) since a moment -- the home card's "이번 주 +N건",
// counted on the server because the app only loads the newest 50 items.
export async function countSavedSince(userId: string, sinceIso: string): Promise<number> {
  const { count, error } = await getClient()
    .from("items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("deleted_at", null)
    .gte("shared_at", sinceIso);
  if (error) throw new Error(`countSavedSince failed: ${error.message}`);
  return count ?? 0;
}

export interface ItemStats {
  total: number;
  byCategory: { category: string; count: number }[];
  // The person's most-used tags (AI + their own, once per item), top 5 --
  // what the stats screen shows now that categories aren't in the UI.
  byTag: { tag: string; count: number }[];
  bySource: { source: string; count: number }[];
  // month as "YYYY-MM", oldest first, zero-filled for the last 6 months
  // (including ones with no saves) so a trend chart has a continuous axis.
  byMonth: { month: string; count: number }[];
  // weekday 0 (일) - 6 (토) x band 0-3 (each a 6h window: 00-05/06-11/12-17/18-23).
  // A grid this coarse reads as a real heatmap on a phone; 7x24 wouldn't.
  heatmap: { weekday: number; band: number; count: number }[];
}

// The server runs in UTC, but every real user of this app is in Korea --
// grouping by the server's local getDay()/getHours() would shift (and for
// weekday, sometimes flip to the wrong day entirely) saves made late at
// night KST. Shift into KST first and read the fields back with the UTC
// getters so the result doesn't depend on the server's own TZ setting.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
function toKST(iso: string): Date {
  return new Date(new Date(iso).getTime() + KST_OFFSET_MS);
}

// REST/PostgREST has no GROUP BY, and at personal-archive volume fetching
// everything and aggregating here is simpler than standing up an RPC for it
// (same tradeoff as searchItems above).
export async function getStats(userId: string): Promise<ItemStats> {
  const { data, error } = await getClient()
    .from("items")
    .select("category, source, shared_at, tags, user_tags")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .limit(5000);

  if (error) throw new Error(`getStats failed: ${error.message}`);
  const rows = (data ?? []) as Pick<ItemRecord, "category" | "source" | "shared_at" | "tags" | "user_tags">[];
  const tagCounts = new Map<string, number>();
  for (const row of rows) {
    for (const tag of new Set([...(row.tags ?? []), ...(row.user_tags ?? [])])) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }

  const categoryCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  const heatmapCounts = new Map<string, number>();

  for (const row of rows) {
    categoryCounts.set(row.category, (categoryCounts.get(row.category) ?? 0) + 1);
    sourceCounts.set(row.source, (sourceCounts.get(row.source) ?? 0) + 1);

    const d = toKST(row.shared_at);
    const weekday = d.getUTCDay();
    const band = Math.floor(d.getUTCHours() / 6);
    const key = `${weekday}-${band}`;
    heatmapCounts.set(key, (heatmapCounts.get(key) ?? 0) + 1);
  }

  const now = toKST(new Date().toISOString());
  const monthCounts = new Map<string, number>();
  const monthKeys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    monthKeys.push(key);
    monthCounts.set(key, 0);
  }
  for (const row of rows) {
    const d = toKST(row.shared_at);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    if (monthCounts.has(key)) monthCounts.set(key, (monthCounts.get(key) ?? 0) + 1);
  }

  const heatmap: ItemStats["heatmap"] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    for (let band = 0; band < 4; band++) {
      heatmap.push({ weekday, band, count: heatmapCounts.get(`${weekday}-${band}`) ?? 0 });
    }
  }

  return {
    total: rows.length,
    byCategory: [...categoryCounts.entries()].map(([category, count]) => ({ category, count })),
    byTag: [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => ({ tag, count })),
    bySource: [...sourceCounts.entries()].map(([source, count]) => ({ source, count })),
    byMonth: monthKeys.map((month) => ({ month, count: monthCounts.get(month) ?? 0 })),
    heatmap,
  };
}

// Short-lived signed URL for a screenshot capture, generated on demand
// (rather than eagerly for every list response) since it's only ever needed
// when someone actually opens that item's detail view. Scoped to the owning
// user -- .eq("user_id", userId) is the ownership check, since the
// service-role client bypasses RLS entirely.
export async function getScreenshotUrl(userId: string, itemId: string): Promise<string> {
  const client = getClient();

  const { data: item, error: itemError } = await client
    .from("items")
    .select("image_path")
    .eq("id", itemId)
    .eq("user_id", userId)
    .single();
  if (itemError || !item?.image_path) throw new Error("screenshot not found");

  const { data: signed, error: signError } = await client.storage
    .from(SCREENSHOTS_BUCKET)
    .createSignedUrl(item.image_path, 300);
  if (signError || !signed) throw new Error(`failed to sign screenshot url: ${signError?.message}`);

  return signed.signedUrl;
}

// Every file name under "<userId>/" in the screenshots bucket. Storage
// lists 100 by default and at most 1000 a page, so this pages until empty.
async function listUserFiles(userId: string): Promise<string[]> {
  const names: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await getClient().storage.from(SCREENSHOTS_BUCKET).list(userId, { limit: 1000, offset });
    if (error) throw new Error(`failed to list screenshots: ${error.message}`);
    names.push(...(data ?? []).map((f) => f.name));
    if (!data || data.length < 1000) return names;
  }
}

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
  // Per-call cost log: keep the rows (aggregate cost), drop who made them.
  const { error: callsError } = await client.from("ai_calls").update({ user_id: null }).eq("user_id", userId);
  if (callsError) console.error(`failed to detach ai_calls: ${callsError.message}`);

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
  await client.from("purchases").update({ user_id: targetId }).eq("user_id", guestId);
  // This month's AI use follows the person (no fresh quota by switching).
  await client.from("ai_usage").update({ user_id: targetId }).eq("user_id", guestId);
  await client.from("ai_calls").update({ user_id: targetId }).eq("user_id", guestId);

  // The consent answer and language are the same person's -- carry them
  // over only where the account hasn't answered itself.
  const { data: plans } = await client.from("user_plans").select("user_id, ai_consent, ai_consent_at, ai_consent_version, lang").in("user_id", [guestId, targetId]);
  const guestPlan = plans?.find((p) => p.user_id === guestId);
  const targetPlan = plans?.find((p) => p.user_id === targetId);
  if (guestPlan && targetPlan && !targetPlan.ai_consent && guestPlan.ai_consent) {
    await client
      .from("user_plans")
      .update({ ai_consent: guestPlan.ai_consent, ai_consent_at: guestPlan.ai_consent_at, ai_consent_version: guestPlan.ai_consent_version })
      .eq("user_id", targetId);
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

export async function linkKakaoUser(kakaoId: number, userId: string): Promise<void> {
  const { error } = await getClient().from("kakao_users").insert({ kakao_id: String(kakaoId), user_id: userId });
  if (error) throw new Error(`linkKakaoUser failed: ${error.message}`);
}

export type AnalyticsEventType = "account_created" | "account_deleted" | "item_saved";

export interface AnalyticsEvent {
  eventType: AnalyticsEventType;
  userId: string;
  category?: Category;
  source?: ItemSource;
}

// One-way stand-in for the account: the same user always hashes to the same
// pseudonym (so "this pseudonym saved 20 things this week" or "came back
// after 10 days" is answerable), but the hash can't be reversed back to an
// account id -- including after that account is deleted and its id stops
// existing anywhere else. That's what keeps analytics_events out from under
// PIPA's "personal information" umbrella despite still telling users apart.
function pseudonymize(userId: string): string {
  return createHmac("sha256", required("ANALYTICS_HASH_SECRET")).update(userId).digest("hex");
}

// Deliberately logs nothing beyond event type + category/source + a
// pseudonym: no titles, no raw text, no ids traceable to the account. Best
// effort and non-throwing -- a broken analytics insert should never fail
// the request it's attached to.
export async function logAnalyticsEvent(event: AnalyticsEvent): Promise<void> {
  try {
    const { error } = await getClient()
      .from("analytics_events")
      .insert({
        pseudonym: pseudonymize(event.userId),
        event_type: event.eventType,
        category: event.category ?? null,
        source: event.source ?? null,
      });
    if (error) throw error;
  } catch (err) {
    console.error("logAnalyticsEvent failed:", err);
  }
}

export function isSupabaseConfigured(): boolean {
  return config.hasSupabase;
}
