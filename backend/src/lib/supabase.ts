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
  tags: string[];
  shared_at: string;
  created_at: string;
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

export async function listItems(userId: string, limit = 30): Promise<{ items: ItemRecord[]; total: number }> {
  const { data, error, count } = await getClient()
    .from("items")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
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
    .order("shared_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(`searchItems failed: ${error.message}`);

  const needle = query.toLowerCase();
  const matches = (data ?? []).filter((item: ItemRecord) => {
    if (item.title?.toLowerCase().includes(needle)) return true;
    if (item.snippet?.toLowerCase().includes(needle)) return true;
    if (item.raw_text?.toLowerCase().includes(needle)) return true;
    if (item.tags.some((tag) => tag.toLowerCase().includes(needle))) return true;
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

export function isSupabaseConfigured(): boolean {
  return config.hasSupabase;
}
