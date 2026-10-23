import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { CATEGORIES } from "../lib/categories.js";
import { IncomingItemSchema, classifyBacklog, processIncomingItem, reorganizeItem } from "../lib/pipeline.js";
import { AiConsentRequiredError, getEntitlement, recordUsage, refundUsage, remaining, requireAiConsent, reserveUsage, setAiConsent } from "../lib/plans.js";
import { clipInterpretation, composeFromItems, interpretSearch, isAiUnavailable, tagFromText, SearchInterpretationSchema } from "../lib/anthropic.js";
import {
  addUserTag,
  countItemsSince,
  getScreenshotUrl,
  getStats,
  listItems,
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
  listItemsWithTag,
  listUnclassifiedItems,
  updateItemText,
  searchItemsSmart,
  trashItem,
} from "../lib/supabase.js";
import { resolveUserId, UnauthorizedError } from "../lib/auth.js";

// Edits from the detail screen. Empty string clears the field (stored null).
// raw_text only for text items -- a screenshot's raw_text is the hidden
// search text Claude read off the image, not something shown to edit.
const UpdateItemSchema = z.object({
  title: z.string().max(200).optional(),
  snippet: z.string().max(1000).optional(),
  rawText: z.string().max(20000).optional(),
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
  // "다른 형식으로 다시": the draft this one replaces -- free once per draft
  // chain (decision Q6).
  retryOf: z.string().uuid().optional(),
});

// A compose result waits here until the person saves it (decision Q6:
// preview before saving). In memory: a server restart drops unsaved
// drafts, which the app reports as expired -- nothing was saved yet.
type ComposeDraft = {
  userId: string;
  tag: string;
  sourceIds: string[];
  category: string;
  title: string;
  body: string;
  freeRetry: boolean;
  expiresAt: number;
};
const DRAFT_TTL_MS = 60 * 60 * 1000;
const drafts = new Map<string, ComposeDraft>();
function takeDraft(id: string, userId: string): ComposeDraft | null {
  const now = Date.now();
  for (const [k, d] of drafts) if (d.expiresAt < now) drafts.delete(k);
  const d = drafts.get(id);
  return d && d.userId === userId ? d : null;
}

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
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

// Korea-time calendar date (YYYY-MM-DD) -- what "지난달"/"어제" in a search
// sentence are relative to, regardless of the server's own timezone.
function todayInKorea(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

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
      const items = await listUnclassifiedItems(userId, parsed.data.limit ?? 100);
      return reply.send({ items, total: items.length });
    }
    if (parsed.data.tag) {
      const items = await listItemsWithTag(userId, parsed.data.tag, parsed.data.limit ?? 100);
      return reply.send({ items, total: items.length });
    }
    const { items, total } = await listItems(userId, { limit: parsed.data.limit });
    return reply.send({ items, total });
  });

  // Search across title/snippet/raw text for the Search screen.
  app.get("/items/search", async (req, reply) => {
    const parsed = SearchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid query", details: parsed.error.flatten() });
    }
    const include = splitTerms(parsed.data.include);
    const exclude = splitTerms(parsed.data.exclude);
    if (include.length === 0 && exclude.length === 0) {
      return reply.code(400).send({ error: "include or exclude required" });
    }
    const userId = await resolveUserId(req);
    const items = await searchItems(userId, include, exclude, parsed.data.limit);
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
        return reply.code(402).send({ error: "quota", kind: "search", limit: ent.search.limit, tier: ent.tier, resetsAt: ent.resetsAt });
      }
      const interpretation = await interpretSearch(parsed.data.query, todayInKorea(), userId);
      await recordUsage(userId, "search").catch((err) => req.log.error(err));
      const result = await searchItemsSmart(userId, interpretation);
      return reply.send({ interpretation, ...result });
    }
  );

  // Plan + this month's AI usage, for the app's quota/미분류함 UI.
  app.get("/me/plan", async (req, reply) => {
    const userId = await resolveUserId(req);
    return reply.send(await getEntitlement(userId));
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
    const result = await classifyBacklog(userId);
    return reply.send(result);
  });

  // Re-runs an (edited) interpretation without calling Claude again -- what
  // removing/toggling one of the interpreted chips hits.
  app.post("/items/search/smart", async (req, reply) => {
    const parsed = SmartSearchSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid body", details: parsed.error.flatten() });
    }
    const userId = await resolveUserId(req);
    const result = await searchItemsSmart(userId, clipInterpretation(parsed.data.interpretation));
    return reply.send(result);
  });

  // Aggregate counts for the Stats screen (category/source/month/heatmap).
  app.get("/items/stats", async (req, reply) => {
    const userId = await resolveUserId(req);
    const stats = await getStats(userId);
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
    if (item.classification_status === "pending") return reply.code(409).send({ error: "already organizing" });
    const started = await reorganizeItem(userId, item);
    if (!started) {
      const ent = await getEntitlement(userId);
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

    // A free retry reuses the same materials; anything else is a new run.
    const previous = retryOf ? takeDraft(retryOf, userId) : null;
    const free = !!previous?.freeRetry;
    if (!free) {
      const ent = await getEntitlement(userId);
      if (remaining(ent, "compose") === 0) {
        return reply.code(402).send({ error: "quota", kind: "compose", limit: ent.compose.limit, tier: ent.tier, resetsAt: ent.resetsAt });
      }
    }
    // Earlier composed memos aren't materials -- they'd fold a summary back
    // into the next summary (decision Q7).
    const picked = previous ? previous.sourceIds : itemIds;
    const items = (picked ? await listItemsByIds(userId, picked) : await listItemsWithTag(userId, tag)).filter((it) => !it.composed_from);
    if (items.length < 2) return reply.code(400).send({ error: "too_few", count: items.length });

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
        instruction || undefined
      );
    } catch (err) {
      if (reservation !== null) await refundUsage(reservation).catch(() => {});
      throw err;
    }
    // Filed under the category most of its sources have.
    const counts = new Map<string, number>();
    for (const it of items) counts.set(it.category, (counts.get(it.category) ?? 0) + 1);
    const category = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    if (retryOf) drafts.delete(retryOf);
    const id = randomUUID();
    // The first run of a chain earns one free retry; the retry itself doesn't.
    const freeRetry = !previous;
    drafts.set(id, { userId, tag, sourceIds: items.map((it) => it.id), category, title: composed.title, body: composed.body, freeRetry, expiresAt: Date.now() + DRAFT_TTL_MS });
    return reply.send({ draft: { id, title: composed.title, body: composed.body }, sourceCount: items.length, freeRetry });
  });

  // Saves a previewed compose result as a memo that remembers its sources.
  app.post("/items/compose/:draftId/save", async (req, reply) => {
    const userId = await resolveUserId(req);
    const { draftId } = req.params as { draftId: string };
    const draft = takeDraft(draftId, userId);
    if (!draft) return reply.code(410).send({ error: "expired" });
    const item = await insertItem({
      userId,
      source: "memo",
      captureType: "text",
      rawText: draft.body,
      title: draft.title,
      category: draft.category as Parameters<typeof insertItem>[0]["category"],
      tags: [draft.tag],
      classificationStatus: "done",
      composedFrom: draft.sourceIds,
    });
    drafts.delete(draftId);
    return reply.send({ item, sourceCount: draft.sourceIds.length });
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
