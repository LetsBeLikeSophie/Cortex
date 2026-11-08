// Screenshot upload/URLs, counts and the stats screen.
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
import { ItemRecord } from "./items.js";
import { selectAllRows } from "./lists.js";
import { KST_OFFSET_MINUTES } from "./search.js";

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
// weekday, sometimes flip to the wrong day entirely) saves made late at night
// where the person is. Shift into their time first and read the fields back
// with the UTC getters, so the result doesn't depend on the server's TZ.
function toLocal(iso: string, utcOffsetMinutes: number): Date {
  return new Date(new Date(iso).getTime() + utcOffsetMinutes * 60 * 1000);
}

// REST/PostgREST has no GROUP BY, and at personal-archive volume fetching
// everything and aggregating here is simpler than standing up an RPC for it
// (same tradeoff as searchItems above).
export async function getStats(userId: string, utcOffsetMinutes = KST_OFFSET_MINUTES): Promise<ItemStats> {
  const rows = await selectAllRows<Pick<ItemRecord, "category" | "source" | "shared_at" | "tags" | "user_tags">>(
    userId,
    "category, source, shared_at, tags, user_tags",
    { live: true }
  );
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

    const d = toLocal(row.shared_at, utcOffsetMinutes);
    const weekday = d.getUTCDay();
    const band = Math.floor(d.getUTCHours() / 6);
    const key = `${weekday}-${band}`;
    heatmapCounts.set(key, (heatmapCounts.get(key) ?? 0) + 1);
  }

  const now = toLocal(new Date().toISOString(), utcOffsetMinutes);
  const monthCounts = new Map<string, number>();
  const monthKeys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    monthKeys.push(key);
    monthCounts.set(key, 0);
  }
  for (const row of rows) {
    const d = toLocal(row.shared_at, utcOffsetMinutes);
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
export async function listUserFiles(userId: string): Promise<string[]> {
  const names: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await getClient().storage.from(SCREENSHOTS_BUCKET).list(userId, { limit: 1000, offset });
    if (error) throw new Error(`failed to list screenshots: ${error.message}`);
    names.push(...(data ?? []).map((f) => f.name));
    if (!data || data.length < 1000) return names;
  }
}
