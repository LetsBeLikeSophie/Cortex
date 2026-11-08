// Word search and sentence (smart) search.
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
// Only the columns matching reads, so a search scan doesn't pull whole rows;
// the few results are then read in full by id (fullRowsInOrder).
const SEARCH_COLUMNS = "id,shared_at,source,capture_type,title,snippet,raw_text,user_note,tags,user_tags";
type SearchRow = Pick<
  ItemRecord,
  "id" | "shared_at" | "source" | "capture_type" | "title" | "snippet" | "raw_text" | "user_note" | "tags" | "user_tags"
>;

async function fullRowsInOrder(userId: string, ids: string[]): Promise<ItemRecord[]> {
  if (ids.length === 0) return [];
  const { data, error } = await getClient().from("items").select().eq("user_id", userId).in("id", ids);
  if (error) throw new Error(error.message);
  const byId = new Map(((data ?? []) as ItemRecord[]).map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is ItemRecord => !!row);
}

function matchesTerm(item: SearchRow, needle: string): boolean {
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
  const inc = include.map((w) => w.toLowerCase()).filter(Boolean);
  const exc = exclude.map((w) => w.toLowerCase()).filter(Boolean);

  const tagInc = tags.map((t) => t.toLowerCase()).filter(Boolean);
  const tagExc = excludeTags.map((t) => t.toLowerCase()).filter(Boolean);
  const hasTag = (item: SearchRow, tag: string) => [...item.tags, ...item.user_tags].some((t) => t.toLowerCase() === tag);

  const keep = (item: SearchRow) => {
    if (exc.some((needle) => matchesTerm(item, needle))) return false;
    if (tagExc.some((tag) => hasTag(item, tag))) return false;
    if (!tagInc.every((tag) => hasTag(item, tag))) return false;
    return inc.every((needle) => matchesTerm(item, needle));
  };
  // Newest first, so the first `limit` matches are the answer.
  try {
    const ids = await scanPages<SearchRow, string>(
      (from, to) =>
        getClient()
          .from("items")
          .select(SEARCH_COLUMNS)
          .eq("user_id", userId)
          .order("shared_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to),
      (item) => (keep(item) ? item.id : undefined),
      (n) => n >= limit
    );
    return await fullRowsInOrder(userId, ids.slice(0, limit));
  } catch (err) {
    throw new Error(`searchItems failed: ${(err as Error).message}`);
  }
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
// Requests without the app's offset (older app versions) mean Korea, where
// they were all made so far.
export const KST_OFFSET_MINUTES = 540;
function isoOffset(minutes: number): string {
  const abs = Math.abs(minutes);
  return `${minutes < 0 ? "-" : "+"}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

export async function searchItemsSmart(
  userId: string,
  q: SearchInterpretation,
  limit = 30,
  utcOffsetMinutes = KST_OFFSET_MINUTES
): Promise<SmartSearchResult> {
  const groups = q.keywords
    .map((k) => [k.term, ...k.synonyms].map((w) => w.toLowerCase().trim()).filter(Boolean))
    .filter((g) => g.length > 0);
  const exc = q.exclude.map((w) => w.toLowerCase().trim()).filter(Boolean);
  const hasFilter = !!(q.source || q.captureType || q.category || q.dateFrom || q.dateTo);

  const run = async (withFilters: boolean) => {
    const build = () => {
      let query = getClient().from("items").select(SEARCH_COLUMNS).eq("user_id", userId);
      if (withFilters) {
        if (q.source) query = query.eq("source", q.source);
        if (q.captureType) query = query.eq("capture_type", q.captureType);
        if (q.category) query = query.eq("category", q.category);
        // Dates come in as calendar days where the person is; shared_at is UTC.
        const zone = isoOffset(utcOffsetMinutes);
        if (q.dateFrom && DATE_RE.test(q.dateFrom)) query = query.gte("shared_at", `${q.dateFrom}T00:00:00${zone}`);
        if (q.dateTo && DATE_RE.test(q.dateTo)) query = query.lte("shared_at", `${q.dateTo}T23:59:59.999${zone}`);
      }
      // "가장 오래된 ..." asks for the start of the archive, not the newest.
      const oldestFirst = q.sort === "oldest";
      return query.order("shared_at", { ascending: oldestFirst }).order("id", { ascending: oldestFirst });
    };
    // Every match is scored, so the whole archive is read (scanPages bounds
    // it); only id + score is kept per match.
    const scored = await scanPages<SearchRow, { id: string; matched_count: number }>(
      (from, to) => build().range(from, to),
      (item) => {
        if (exc.some((needle) => matchesTerm(item, needle))) return undefined;
        const matched_count = groups.filter((g) => g.some((needle) => matchesTerm(item, needle))).length;
        // No keywords at all ("지난달 인스타에서 저장한 거") means the filters
        // alone are the query -- everything they let through counts.
        return groups.length === 0 || matched_count > 0 ? { id: item.id, matched_count } : undefined;
      }
    ).catch((err: Error) => {
      throw new Error(`searchItemsSmart failed: ${err.message}`);
    });
    // Stable sort, so equal scores keep the query's date order. An
    // explicit order (oldest/newest) wins outright: it was asked for.
    return scored.sort((a, b) => (q.sort ? 0 : b.matched_count - a.matched_count));
  };

  const scored = await run(true);
  const relaxed_count = scored.length === 0 && hasFilter && groups.length > 0 ? (await run(false)).length : null;
  const top = scored.slice(0, limit);
  const rows = await fullRowsInOrder(
    userId,
    top.map((s) => s.id)
  ).catch((err: Error) => {
    throw new Error(`searchItemsSmart failed: ${err.message}`);
  });
  const score = new Map(top.map((s) => [s.id, s.matched_count]));
  return { items: rows.map((row) => ({ ...row, matched_count: score.get(row.id) ?? 0 })), relaxed_count };
}
