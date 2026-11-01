import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { resyncLapsedPurchases } from "../lib/billing.js";
import { onlyStackFrames, safeErrorName } from "../lib/appErrors.js";
import { ImageRejectedError } from "../lib/image.js";
import { isPlayBillingConfigured } from "../lib/googlePlay.js";
import { config } from "../config.js";
import { CATEGORIES } from "../lib/categories.js";
import { IncomingItemSchema, classifyBacklog, processIncomingItem, reorganizeItem } from "../lib/pipeline.js";
import { AiConsentRequiredError, getEntitlement, recordUsage, refundUsage, remaining, requireAiConsent, reserveUsage, setAiConsent, syncLang } from "../lib/plans.js";
import { normalizeLang, DEFAULT_LANG } from "../lib/anthropic.js";
import { dailyAiBudget } from "../lib/aiLog.js";
import { clipInterpretation, composeFromItems, interpretSearch, isAiUnavailable, suggestTagMerges, tagFromText, SearchInterpretationSchema } from "../lib/anthropic.js";
import {
  addUserTag,
  countItemsSince,
  getScreenshotUrl,
  getStats,
  KST_OFFSET_MINUTES,
  logAnalyticsEvent,
  logAppError,
  listItems,
  listAllItems,
  listLookback,
  listTags,
  listTrash,
  permanentlyDeleteItem,
  removeAiTag,
  removeUserTag,
  restoreItem,
  searchItems,
  getItemForUser,
  insertItem,
  listItemsByIds,
  getClient,
  countSavedSince,
  listItemsWithTag,
  listUnclassifiedItems,
  updateItemText,
  searchItemsSmart,
  trashItem,
  reportAiOutput,
  setItemLocked,
  unlockAllItems,
  listTagCounts,
  mergeTags,
  tagGroupCounts,
} from "../lib/supabase.js";
import { resolveUserId, UnauthorizedError } from "../lib/auth.js";

// Edits from the detail screen. Empty string clears the field (stored null).
// raw_text only for text items -- a screenshot's raw_text is the hidden
// search text Claude read off the image, not something shown to edit.
// 메모 내보내기 runs one at a time per person: it reads every memo.
const exporting = new Set<string>();
// People whose 'AI로 정리' run is queueing right now.
const sorting = new Set<string>();

const UpdateItemSchema = z.object({
  title: z.string().max(200).optional(),
  snippet: z.string().max(1000).optional(),
  rawText: z.string().max(200_000).optional(),
  // The person's own note on a screenshot/link ("내 메모").
  userNote: z.string().max(1000).optional(),
  // Only sent by "undo" after an AI re-organize, putting back what the AI
  // replaced (it rewrites category and AI tags along with title/memo).
  category: z.enum(CATEGORIES).optional(),
  tags: z.array(z.string().max(30)).max(8).optional(),
});

const ComposeSchema = z.object({
  tag: z.string().min(1).max(60),
  format: z.enum(["auto", "course", "list", "summary"]).default("auto"),
  // What shape they want, in their words (optional; empty = AI decides).
  instruction: z.string().trim().max(100).optional(),
  // Picked items instead of the whole tag (decision Q5).
  itemIds: z.array(z.string().uuid()).min(2).max(50).optional(),
  // "다른 모양으로 다시": the composed memo to remake in place (its own
  // materials; free once per memo).
  retryOf: z.string().uuid().optional(),
});

// Composed memos that already used their one free remake. In memory: a
// restart forgets it (the person gets one more free remake at worst).
const remadeFree = new Set<string>();

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  // The next page of a list: the shared_at of the last row so far.
  before: z.iso.datetime({ offset: true }).optional(),
  // A home tag tab: that tag's items across the whole archive, not just
  // whatever is among the newest `limit`.
  tag: z.string().min(1).max(60).optional(),
  // The 미분류 tab: everything waiting, newest first -- the order
  // classify-backlog works through, so the list matches what 'AI로 정리' does.
  status: z.enum(["unclassified"]).optional(),
});

const SearchQuerySchema = z.object({
  // Comma-separated tag/word lists -- the search screen's chips split into
  // "include" (AND'd together) and "exclude" (NOT'd) before calling this.
  include: z.string().optional(),
  exclude: z.string().optional(),
  // The "# 태그로 좁히기" chips: matched against tags exactly ('이사' never
  // pulls in '이사님'), unlike the loose words above (decision S1).
  tags: z.string().optional(),
  excludeTags: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

function splitTerms(raw: string | undefined): string[] {
  return (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

const AskSearchSchema = z.object({
  query: z.string().trim().min(1).max(200),
});

const SmartSearchSchema = z.object({
  // sort was added later; an app version that doesn't send it means "no order".
  interpretation: SearchInterpretationSchema.extend({ sort: SearchInterpretationSchema.shape.sort.default(null) }),
});

// Where the person is, from the app's X-Cortex-Utc-Offset (minutes east of
// UTC): what "지난달"/"어제" in a search sentence and the stats' days mean.
function utcOffsetOf(req: FastifyRequest): number {
  const n = Number(req.headers["x-cortex-utc-offset"]);
  return Number.isInteger(n) && n >= -720 && n <= 840 ? n : KST_OFFSET_MINUTES;
}
function localToday(utcOffsetMinutes: number): string {
  return new Date(Date.now() + utcOffsetMinutes * 60 * 1000).toISOString().slice(0, 10);
}

// What the app reports on the way to Pro; anything else is refused, so this
// can't turn into a place to send free text.
const AppErrorSchema = z.object({
  appVersion: z.string().max(32),
  name: z.string().max(200),
  stack: z.string().max(16_000),
});

const AppEventSchema = z.object({
  type: z.enum(["paywall_view", "purchase_started"]),
  detail: z.enum(["default", "classify", "search", "compose", "tag_cleanup", "trial_ending", "trial_ended", "monthly", "yearly", "lifetime"]),
});

const AddTagSchema = z.object({
  tag: z.string().min(1).max(30),
});

const TagFromVoiceSchema = z.object({
  text: z.string().min(1).max(500),
});

export async function itemsRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (_req, reply) => {
    if (!config.hasAnthropicKey) {
      reply.code(503).send({ error: "ANTHROPIC_API_KEY is not configured on the server" });
    } else if (!config.hasSupabase) {
      reply.code(503).send({ error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not configured on the server" });
    }
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof UnauthorizedError) {
      return reply.code(401).send({ error: err.message });
    }
    if (err instanceof AiConsentRequiredError) {
      return reply.code(403).send({ error: "ai_consent" });
    }
    // Claude can't be used right now (credit ran out / key rejected): a
    // stable error the app can turn into a plain sentence, instead of the
    // raw upstream 400 body.
    if (isAiUnavailable(err)) {
      _req.log.error(err);
      return reply.code(503).send({ error: "ai_unavailable" });
    }
    if (err instanceof ImageRejectedError) return reply.code(err.status).send({ error: err.message });
    reply.send(err);
  });

  // Ingest a shared item from the mobile app's share extension. The only
  // route rate-limited (see server.ts) -- it's the one that calls Claude.
  app.post("/items", { config: { rateLimit: {} } }, async (req, reply) => {
    const parsed = IncomingItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid body", details: parsed.error.flatten() });
    }
    const userId = await resolveUserId(req);

    // Abuse ceiling only -- saving is unlimited by plan, and Claude cost is
    // capped by the monthly classification quota instead (see plans.ts).
    // Rolling 24h rather than calendar-day to dodge timezone edge cases.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const usedToday = await countItemsSince(userId, since);
    if (usedToday >= config.dailyItemLimit) {
      return reply.code(429).send({
        error: "daily item limit reached",
        limit: config.dailyItemLimit,
      });
    }

    if (parsed.data.captureType === "screenshot") {
      const approxBytes = Math.floor((parsed.data.imageBase64.length * 3) / 4);
      if (approxBytes > config.maxImageBytes) {
        return reply.code(413).send({
          error: "image too large",
          maxBytes: config.maxImageBytes,
        });
      }
    }

    // item_saved is logged from inside processIncomingItem's background
    // task now, with the real category once classification resolves --
    // logging it here would only ever see the 'pending' placeholder
    // category, which isn't what analytics is supposed to be counting.
    const item = await processIncomingItem(parsed.data, userId);
    return reply.code(201).send(item);
  });

  // Recent items for the Home screen.
  app.get("/items", async (req, reply) => {
    const parsed = ListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid query", details: parsed.error.flatten() });
    }
    const userId = await resolveUserId(req);
    if (parsed.data.status === "unclassified") {
      const items = await listUnclassifiedItems(userId, parsed.data.limit ?? 100, parsed.data.before);
      return reply.send({ items, total: items.length });
    }
    if (parsed.data.tag) {
      const items = await listItemsWithTag(userId, parsed.data.tag, parsed.data.limit ?? 100, parsed.data.before);
      return reply.send({ items, total: items.length });
    }
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [{ items, total }, weekCount] = await Promise.all([
      listItems(userId, { limit: parsed.data.limit, before: parsed.data.before }),
      countSavedSince(userId, weekAgo).catch(() => null),
    ]);
    return reply.send({ items, total, weekCount });
  });

  // 메모 내보내기: every memo not in the trash, for the app to write out as
  // a text file. No AI, no quota; only the columns the file shows.
  app.get("/items/export", async (req, reply) => {
    const userId = await resolveUserId(req);
    if (exporting.has(userId)) return reply.code(429).send({ error: "export already running" });
    exporting.add(userId);
    try {
      return reply.send({ items: await listAllItems(userId) });
    } finally {
      exporting.delete(userId);
    }
  });

  // '다시 보기' reminder: a few older memos' titles (never locked ones),
  // picked here so the phone doesn't fetch the whole archive for it.
  app.get("/items/lookback", async (req, reply) => {
    const userId = await resolveUserId(req);
    return reply.send({ items: await listLookback(userId, 3) });
  });

  // Search across title/snippet/raw text for the Search screen.
  app.get("/items/search", async (req, reply) => {
    const parsed = SearchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid query", details: parsed.error.flatten() });
    }
    const include = splitTerms(parsed.data.include);
    const exclude = splitTerms(parsed.data.exclude);
    const tags = splitTerms(parsed.data.tags);
    const excludeTags = splitTerms(parsed.data.excludeTags);
    if (include.length === 0 && exclude.length === 0 && tags.length === 0 && excludeTags.length === 0) {
      return reply.code(400).send({ error: "include or exclude required" });
    }
    const userId = await resolveUserId(req);
    const items = await searchItems(userId, include, exclude, parsed.data.limit, tags, excludeTags);
    return reply.send({ items });
  });

  // Natural-language search: one Claude call turns the sentence into
  // filters + keywords, then searchItemsSmart runs it. The interpretation
  // goes back with the results so the client can show it as editable chips.
  app.post(
    "/items/search/ask",
    { config: { rateLimit: { max: config.searchRateLimitMax } } },
    async (req, reply) => {
      const parsed = AskSearchSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid body", details: parsed.error.flatten() });
      }
      const userId = await resolveUserId(req);
      await requireAiConsent(userId);
      // Metered monthly (tag/keyword search stays free). 402 carries what
      // the app needs to say why and when it comes back.
      // Fails open like saving does (see processIncomingItem).
      const ent = await getEntitlement(userId).catch((err) => {
        req.log.error(err);
        return null;
      });
      if (ent && remaining(ent, "search") === 0) {
        await logAnalyticsEvent({ eventType: "quota_hit", userId, detail: "search" });
        return reply.code(402).send({ error: "quota", kind: "search", limit: ent.search.limit, tier: ent.tier, resetsAt: ent.resetsAt });
      }
      await dailyAiBudget.assertOpen();
      const utcOffset = utcOffsetOf(req);
      const interpretation = await interpretSearch(parsed.data.query, localToday(utcOffset), userId);
      await recordUsage(userId, "search").catch((err) => req.log.error(err));
      const result = await searchItemsSmart(userId, interpretation, undefined, utcOffset);
      // Locked memos stay out of AI search.
      return reply.send({ interpretation, ...result, items: result.items.filter((it) => !it.locked) });
    }
  );

  // Plan + this month's AI usage, for the app's quota/미분류함 UI.
  app.get("/me/plan", async (req, reply) => {
    const userId = await resolveUserId(req);
    // The app sends its device language here; AI output follows it.
    if (isPlayBillingConfigured()) await resyncLapsedPurchases(userId).catch((err) => req.log.error(err));
    await syncLang(userId, normalizeLang(req.headers["x-cortex-lang"])).catch((err) => req.log.warn(err));
    return reply.send(await getEntitlement(userId));
  });

  app.post("/me/event", async (req, reply) => {
    const parsed = AppEventSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    const userId = await resolveUserId(req);
    await logAnalyticsEvent({ eventType: parsed.data.type, userId, detail: parsed.data.detail });
    return reply.code(204).send();
  });

  // Where the app broke (decision E1). Signed in so it can't be spammed from
  // outside, but no account is stored.
  app.post("/me/error", { config: { rateLimit: {} } }, async (req, reply) => {
    const parsed = AppErrorSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    await resolveUserId(req);
    const stack = onlyStackFrames(parsed.data.stack);
    if (stack) await logAppError({ appVersion: parsed.data.appVersion, name: safeErrorName(parsed.data.name), stack }).catch((err) => req.log.error(err));
    return reply.code(204).send();
  });

  // The answer to "send saved content to the AI abroad?" -- recorded with
  // time and notice version; changeable any time from the profile.
  app.post("/me/ai-consent", async (req, reply) => {
    const parsed = z.object({ agree: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    const userId = await resolveUserId(req);
    await setAiConsent(userId, parsed.data.agree);
    return reply.send(await getEntitlement(userId));
  });

  // "AI로 정리": classify as much of the 미분류함 backlog as the quota
  // allows. Calls Claude, so rate limited like POST /items.
  app.post("/items/classify-backlog", { config: { rateLimit: {} } }, async (req, reply) => {
    const userId = await resolveUserId(req);
    await requireAiConsent(userId);
    // A second tap while the first run is still queueing would pick the
    // same rows; one run per person.
    if (sorting.has(userId)) return reply.code(409).send({ error: "sort_running" });
    sorting.add(userId);
    try {
      return reply.send(await classifyBacklog(userId));
    } finally {
      sorting.delete(userId);
    }
  });

  // Re-runs an (edited) interpretation without calling Claude again -- what
  // removing/toggling one of the interpreted chips hits.
  app.post("/items/search/smart", async (req, reply) => {
    const parsed = SmartSearchSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid body", details: parsed.error.flatten() });
    }
    const userId = await resolveUserId(req);
    const result = await searchItemsSmart(userId, clipInterpretation(parsed.data.interpretation), undefined, utcOffsetOf(req));
    return reply.send(result);
  });

  // Aggregate counts for the Stats screen (category/source/month/heatmap).
  app.get("/items/stats", async (req, reply) => {
    const userId = await resolveUserId(req);
    const stats = await getStats(userId, utcOffsetOf(req));
    return reply.send(stats);
  });

  // A signed URL to view one screenshot capture's image, generated fresh
  // per request rather than stored -- it's only ever needed when the item
  // detail sheet is actually opened.
  app.get("/items/:id/screenshot-url", async (req, reply) => {
    const userId = await resolveUserId(req);
    const { id } = req.params as { id: string };
    try {
      const url = await getScreenshotUrl(userId, id);
      return reply.send({ url });
    } catch {
      return reply.code(404).send({ error: "screenshot not found" });
    }
  });

  // Distinct tags (AI-assigned + user-added) across everything this user
  // has saved, for the home tab picker's search-as-you-type list.
  app.get("/items/tags", async (req, reply) => {
    const userId = await resolveUserId(req);
    const tags = await listTags(userId);
    return reply.send({ tags });
  });

  // Trashed items, most recently deleted first.
  app.get("/items/trash", async (req, reply) => {
    const userId = await resolveUserId(req);
    const items = await listTrash(userId);
    return reply.send({ items });
  });

  // One item, for refreshing the detail screen (e.g. while a re-organize runs).
  app.get("/items/:id", async (req, reply) => {
    const userId = await resolveUserId(req);
    const { id } = req.params as { id: string };
    const item = await getItemForUser(userId, id);
    if (!item) return reply.code(404).send({ error: "not found" });
    return reply.send(item);
  });

  app.patch("/items/:id", async (req, reply) => {
    const parsed = UpdateItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid body", details: parsed.error.flatten() });
    }
    const userId = await resolveUserId(req);
    const { id } = req.params as { id: string };
    const item = await getItemForUser(userId, id);
    if (!item) return reply.code(404).send({ error: "not found" });
    const blankToNull = (v?: string) => (v === undefined ? undefined : v.trim() === "" ? null : v.trim());
    if (parsed.data.rawText !== undefined && item.capture_type !== "text") {
      return reply.code(400).send({ error: "rawText is editable only on text items" });
    }
    const updated = await updateItemText(userId, id, {
      title: blankToNull(parsed.data.title),
      snippet: blankToNull(parsed.data.snippet),
      rawText: blankToNull(parsed.data.rawText),
      userNote: blankToNull(parsed.data.userNote),
      category: parsed.data.category,
      tags: parsed.data.tags,
    });
    return reply.send(updated);
  });

  // "AI로 다시 정리": re-run classification on one item with the person's
  // current title/memo as a hint. Uses one from the monthly quota.
  app.post("/items/:id/reorganize", { config: { rateLimit: {} } }, async (req, reply) => {
    const userId = await resolveUserId(req);
    await requireAiConsent(userId);
    const { id } = req.params as { id: string };
    const item = await getItemForUser(userId, id);
    if (!item) return reply.code(404).send({ error: "not found" });
    // A locked memo stays away from the AI until it is unlocked.
    if (item.locked) return reply.code(409).send({ error: "locked" });
    if (item.classification_status === "pending") return reply.code(409).send({ error: "already organizing" });
    const started = await reorganizeItem(userId, item);
    if (!started) {
      const ent = await getEntitlement(userId);
      await logAnalyticsEvent({ eventType: "quota_hit", userId, detail: "classify" });
      return reply.code(402).send({ error: "quota", kind: "classify", limit: ent.classify.limit, tier: ent.tier, resetsAt: ent.resetsAt });
    }
    return reply.code(202).send({ ok: true });
  });

  // "모아서 만들기": everything under one tag -> one new text memo (a course,
  // a list or a summary), saved with that tag. Metered monthly (402 when
  // used up); the use is handed back if the AI call fails.
  app.post("/items/compose", { config: { rateLimit: {} } }, async (req, reply) => {
    const parsed = ComposeSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    const userId = await resolveUserId(req);
    await requireAiConsent(userId);
    const { tag, format, itemIds, retryOf, instruction } = parsed.data;

    // A remake works on an existing composed memo: same materials, same
    // memo (updated in place), free the first time.
    const previous = retryOf ? await getItemForUser(userId, retryOf) : null;
    if (retryOf && (!previous || !previous.composed_from || previous.deleted_at)) return reply.code(404).send({ error: "not found" });
    const free = !!previous && !remadeFree.has(previous.id);
    if (!free) {
      const ent = await getEntitlement(userId);
      if (remaining(ent, "compose") === 0) {
        await logAnalyticsEvent({ eventType: "quota_hit", userId, detail: "compose" });
        return reply.code(402).send({ error: "quota", kind: "compose", limit: ent.compose.limit, tier: ent.tier, resetsAt: ent.resetsAt });
      }
    }
    // Earlier composed memos aren't materials -- they'd fold a summary back
    // into the next summary (decision Q7).
    const picked = previous ? previous.composed_from! : itemIds;
    const items = (picked ? await listItemsByIds(userId, picked) : await listItemsWithTag(userId, tag)).filter((it) => !it.composed_from && !it.locked);
    if (items.length < 2) return reply.code(400).send({ error: "too_few", count: items.length });

    await dailyAiBudget.assertOpen();
    const reservation = free ? null : await reserveUsage(userId, "compose");
    let composed: { title: string; body: string };
    try {
      composed = await composeFromItems(
        tag,
        format,
        items.map((it) => ({
          title: it.title,
          memo: it.snippet,
          myMemo: it.user_note,
          keyText: it.capture_type === "screenshot" ? it.raw_text : null,
          body: it.capture_type === "text" ? it.raw_text : null,
          category: it.category,
          tags: [...it.tags, ...it.user_tags],
          url: it.raw_url,
        })),
        userId,
        instruction || undefined,
        normalizeLang(req.headers["x-cortex-lang"]) ?? (await getEntitlement(userId)).lang ?? DEFAULT_LANG
      );
    } catch (err) {
      if (reservation !== null) await refundUsage(reservation).catch(() => {});
      throw err;
    }
    // Saved right away -- the use is counted, so the result must exist even
    // if the person closed the app while it ran. The order of composed_from
    // is the order [#N] references count in.
    const sourceIds = items.map((it) => it.id);
    if (previous) {
      remadeFree.add(previous.id);
      const { error } = await getClient().from("items").update({ title: composed.title, raw_text: composed.body, composed_from: sourceIds }).eq("id", previous.id).eq("user_id", userId);
      if (error) throw new Error(`compose remake failed: ${error.message}`);
      const item = await getItemForUser(userId, previous.id);
      return reply.send({ item, sourceCount: items.length, freeRemake: false });
    }
    // Filed under the category most of its sources have.
    const counts = new Map<string, number>();
    for (const it of items) counts.set(it.category, (counts.get(it.category) ?? 0) + 1);
    const category = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0] as (typeof items)[number]["category"];
    const item = await insertItem({
      userId,
      source: "memo",
      captureType: "text",
      rawText: composed.body,
      title: composed.title,
      category,
      tags: [tag],
      classificationStatus: "done",
      composedFrom: sourceIds,
    });
    return reply.send({ item, sourceCount: items.length, freeRemake: true });
  });

  // A composed memo's sources (still in the archive), for "원본 N개".
  app.get("/items/:id/sources", async (req, reply) => {
    const userId = await resolveUserId(req);
    const { id } = req.params as { id: string };
    const item = await getItemForUser(userId, id);
    if (!item) return reply.code(404).send({ error: "not found" });
    const items = await listItemsByIds(userId, item.composed_from ?? []);
    return reply.send({ items });
  });

  // Soft delete -- moves the item to the trash rather than removing it.
  app.delete("/items/:id", async (req, reply) => {
    const userId = await resolveUserId(req);
    const { id } = req.params as { id: string };
    try {
      await trashItem(userId, id);
      return reply.code(200).send({ ok: true });
    } catch (err) {
      return reply.code(404).send({ error: err instanceof Error ? err.message : "delete failed" });
    }
  });

  // Memo lock: the PIN lives on the device; the server only keeps the flag
  // (so AI search and compose can leave the memo out).
  app.post("/items/:id/lock", async (req, reply) => {
    const parsed = z.object({ locked: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    const userId = await resolveUserId(req);
    const { id } = req.params as { id: string };
    try {
      await setItemLocked(userId, id, parsed.data.locked);
      return reply.send({ ok: true, locked: parsed.data.locked });
    } catch (err) {
      return reply.code(404).send({ error: err instanceof Error ? err.message : "lock failed" });
    }
  });

  app.post("/items/unlock-all", async (req, reply) => {
    const userId = await resolveUserId(req);
    return reply.send({ ok: true, changed: await unlockAllItems(userId) });
  });

  // 태그 정리하기, step 1: the AI proposes groups from tag names only.
  // Metered; nothing changes until step 2.
  app.post("/tags/cleanup/suggest", { config: { rateLimit: {} } }, async (req, reply) => {
    const userId = await resolveUserId(req);
    await requireAiConsent(userId);
    const ent = await getEntitlement(userId);
    if (remaining(ent, "tag_cleanup") === 0) {
      await logAnalyticsEvent({ eventType: "quota_hit", userId, detail: "tag_cleanup" });
      return reply.code(402).send({ error: "quota", kind: "tag_cleanup", limit: ent.tag_cleanup.limit, tier: ent.tier, resetsAt: ent.resetsAt });
    }
    const tags = await listTagCounts(userId);
    if (tags.length < 2) return reply.send({ groups: [], left: remaining(ent, "tag_cleanup") });
    await dailyAiBudget.assertOpen();
    const reservation = await reserveUsage(userId, "tag_cleanup");
    try {
      const groups = await suggestTagMerges(tags.slice(0, 400), userId, normalizeLang(req.headers["x-cortex-lang"]) ?? ent.lang ?? DEFAULT_LANG);
      // Nothing to tidy -> the use is handed back.
      if (groups.length === 0) await refundUsage(reservation).catch(() => {});
      const counts = new Map(tags.map((t) => [t.name, t.count]));
      const sizes = groups.length ? await tagGroupCounts(userId, groups) : [];
      return reply.send({
        groups: groups.map((g, i) => ({
          ...g,
          counts: Object.fromEntries([g.keep, ...g.merge].map((n) => [n, counts.get(n) ?? 0])),
          after: sizes[i].after,
          changes: sizes[i].changes,
        })),
        left: remaining(ent, "tag_cleanup") - (groups.length === 0 ? 0 : 1),
      });
    } catch (err) {
      await refundUsage(reservation).catch(() => {});
      throw err;
    }
  });

  // 태그 정리하기, step 2: merge the groups the person ticked (free).
  app.post("/tags/cleanup/apply", async (req, reply) => {
    const parsed = z
      .object({ groups: z.array(z.object({ keep: z.string().trim().min(1).max(30), merge: z.array(z.string().trim().min(1).max(60)).min(1).max(50) })).min(1).max(20) })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    const userId = await resolveUserId(req);
    const changed = await mergeTags(userId, parsed.data.groups);
    return reply.send({ ok: true, changed });
  });

  // "AI 결과 신고": flags the AI-written title/memo/tags of one item.
  app.post("/items/:id/report", { config: { rateLimit: {} } }, async (req, reply) => {
    const userId = await resolveUserId(req);
    const { id } = req.params as { id: string };
    try {
      await reportAiOutput(userId, id);
      return reply.code(200).send({ ok: true });
    } catch (err) {
      return reply.code(404).send({ error: err instanceof Error ? err.message : "report failed" });
    }
  });

  app.post("/items/:id/restore", async (req, reply) => {
    const userId = await resolveUserId(req);
    const { id } = req.params as { id: string };
    try {
      await restoreItem(userId, id);
      return reply.code(200).send({ ok: true });
    } catch (err) {
      return reply.code(404).send({ error: err instanceof Error ? err.message : "restore failed" });
    }
  });

  // The real, unrecoverable delete -- only valid from the trash (see
  // permanentlyDeleteItem's own guard against deleting a non-trashed item).
  app.delete("/items/:id/permanent", async (req, reply) => {
    const userId = await resolveUserId(req);
    const { id } = req.params as { id: string };
    try {
      await permanentlyDeleteItem(userId, id);
      return reply.code(200).send({ ok: true });
    } catch (err) {
      return reply.code(404).send({ error: err instanceof Error ? err.message : "delete failed" });
    }
  });

  // Adds one user tag. The AI-assigned `tags` column has no route that can
  // touch it at all -- this only ever reads/writes user_tags.
  // Turns one spoken sentence (already transcribed client-side) into a
  // single clean tag via a small Claude call -- not tied to a specific
  // item, since the cleanup itself doesn't need one; the client adds the
  // returned tag onto whichever item it's actually editing via the
  // existing POST /items/:id/tags above. Calls Claude, so it's rate
  // limited the same way POST /items is.
  app.post("/items/tags/from-voice", { config: { rateLimit: {} } }, async (req, reply) => {
    const parsed = TagFromVoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid body", details: parsed.error.flatten() });
    }
    // Auth-gated like every other route here; the user id only feeds the
    // per-call usage log, the result itself isn't scoped to a user.
    const userId = await resolveUserId(req);
    await requireAiConsent(userId);
    await dailyAiBudget.assertOpen();
    const tag = await tagFromText(parsed.data.text, userId);
    return reply.send({ tag });
  });

  app.post("/items/:id/tags", async (req, reply) => {
    const parsed = AddTagSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid body", details: parsed.error.flatten() });
    }
    const userId = await resolveUserId(req);
    const { id } = req.params as { id: string };
    try {
      const item = await addUserTag(userId, id, parsed.data.tag);
      return reply.send(item);
    } catch (err) {
      return reply.code(404).send({ error: err instanceof Error ? err.message : "update failed" });
    }
  });

  app.delete("/items/:id/tags/:tag", async (req, reply) => {
    const userId = await resolveUserId(req);
    const { id, tag } = req.params as { id: string; tag: string };
    try {
      const item = await removeUserTag(userId, id, tag);
      return reply.send(item);
    } catch (err) {
      return reply.code(404).send({ error: err instanceof Error ? err.message : "update failed" });
    }
  });

  // Removes one AI-assigned tag -- the one write path onto `tags` (see
  // removeAiTag). A distinct path from the user_tags route above rather
  // than one route guessing which column a tag came from.
  app.delete("/items/:id/tags/ai/:tag", async (req, reply) => {
    const userId = await resolveUserId(req);
    const { id, tag } = req.params as { id: string; tag: string };
    try {
      const item = await removeAiTag(userId, id, tag);
      return reply.send(item);
    } catch (err) {
      return reply.code(404).send({ error: err instanceof Error ? err.message : "update failed" });
    }
  });
}
