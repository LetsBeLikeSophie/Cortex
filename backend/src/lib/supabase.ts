import { createHmac } from "node:crypto";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config, required } from "../config.js";
import { Category } from "./categories.js";

const SCREENSHOTS_BUCKET = "item-screenshots";

let client: SupabaseClient | null = null;

// Lazy singleton so the server can boot (and e.g. serve /health, or exercise
// the metadata fetcher) even before Supabase credentials are configured --
// only routes that actually touch the DB pay for the missing-config error.
function getClient(): SupabaseClient {
  if (!client) {
    client = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"));
  }
  return client;
}

export type ItemSource = "instagram" | "kakaotalk" | "safari" | "youtube" | "memo" | "other";
export type ItemCaptureType = "link" | "text" | "screenshot";

export interface ItemRecord {
  id: string;
  user_id: string;
  source: ItemSource;
  capture_type: ItemCaptureType;
  raw_url: string | null;
  raw_text: string | null;
  image_path: string | null;
  title: string | null;
  snippet: string | null;
  category: Category;
  tags: string[]; // AI-assigned, read-only from the client
  user_tags: string[]; // user-added, freely add/removable
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
  title?: string;
  snippet?: string;
  category: Category;
  tags: string[];
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
      title: item.title ?? null,
      snippet: item.snippet ?? null,
      category: item.category,
      tags: item.tags,
    })
    .select()
    .single();

  if (error) throw new Error(`insertItem failed: ${error.message}`);
  return data as ItemRecord;
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

// user_tags only -- the AI-assigned `tags` column has no API path that can
// touch it, so there's no way to accidentally (or even deliberately, short
// of direct DB access) remove an auto-assigned tag through the app.
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

export async function listItems(userId: string, limit = 30): Promise<{ items: ItemRecord[]; total: number }> {
  const { data, error, count } = await getClient()
    .from("items")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("shared_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`listItems failed: ${error.message}`);
  return { items: (data ?? []) as ItemRecord[], total: count ?? 0 };
}

// PostgREST's `or=()` logic-tree parser doesn't accept a `column::cast`
// inside a grouped filter, so `tags::text.ilike...` can't sit alongside the
// other ilike clauses there (see db/schema.sql's tsvector index --
// `.textSearch` against that is the real fix once search quality/volume
// demands it). For v1, filter tags in JS instead: fetch a generous window
// for this user and match title/snippet/raw_text/tags here.
export async function searchItems(userId: string, query: string, limit = 30): Promise<ItemRecord[]> {
  const { data, error } = await getClient()
    .from("items")
    .select()
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("shared_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(`searchItems failed: ${error.message}`);

  const needle = query.toLowerCase();
  const matches = (data ?? []).filter((item: ItemRecord) => {
    if (item.title?.toLowerCase().includes(needle)) return true;
    if (item.snippet?.toLowerCase().includes(needle)) return true;
    if (item.raw_text?.toLowerCase().includes(needle)) return true;
    if (item.tags.some((tag) => tag.toLowerCase().includes(needle))) return true;
    if (item.user_tags.some((tag) => tag.toLowerCase().includes(needle))) return true;
    return false;
  });

  return matches.slice(0, limit) as ItemRecord[];
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

export interface ItemStats {
  total: number;
  byCategory: { category: string; count: number }[];
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
    .select("category, source, shared_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .limit(5000);

  if (error) throw new Error(`getStats failed: ${error.message}`);
  const rows = (data ?? []) as Pick<ItemRecord, "category" | "source" | "shared_at">[];

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

// Removes everything a user's account owns: uploaded screenshots (stored
// under `${userId}/...` in the bucket, per uploadScreenshot above), item
// rows, then the auth user itself. Called from both account-deletion paths
// (self-serve DELETE /auth/me and the Kakao unlink webhook) so a deleted
// account doesn't leave orphaned screenshot files sitting in Storage forever.
export async function deleteUserAccount(userId: string): Promise<void> {
  const client = getClient();

  const { data: files, error: listError } = await client.storage.from(SCREENSHOTS_BUCKET).list(userId);
  if (listError) throw new Error(`failed to list screenshots: ${listError.message}`);
  if (files && files.length > 0) {
    const paths = files.map((file) => `${userId}/${file.name}`);
    const { error: removeError } = await client.storage.from(SCREENSHOTS_BUCKET).remove(paths);
    if (removeError) throw new Error(`failed to delete screenshots: ${removeError.message}`);
  }

  const { error: itemsError } = await client.from("items").delete().eq("user_id", userId);
  if (itemsError) throw new Error(`failed to delete items: ${itemsError.message}`);

  const { error: mappingError } = await client.from("kakao_users").delete().eq("user_id", userId);
  if (mappingError) throw new Error(`failed to delete kakao_users mapping: ${mappingError.message}`);

  const { error: userError } = await client.auth.admin.deleteUser(userId);
  if (userError) throw new Error(`failed to delete user: ${userError.message}`);
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
