import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { IncomingItemSchema, processIncomingItem } from "../lib/pipeline.js";
import {
  addUserTag,
  countItemsSince,
  getScreenshotUrl,
  getStats,
  listItems,
  listTags,
  listTrash,
  logAnalyticsEvent,
  permanentlyDeleteItem,
  pinItem,
  removeUserTag,
  restoreItem,
  searchItems,
  trashItem,
  unpinItem,
} from "../lib/supabase.js";
import { resolveUserId, UnauthorizedError } from "../lib/auth.js";

// Home's 즐겨찾기 tab (?pinned=true) reads this; its user-picked tag tabs
// filter the plain recent-items call client-side instead.
const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  pinned: z.coerce.boolean().optional(),
});

const SearchQuerySchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const AddTagSchema = z.object({
  tag: z.string().min(1).max(30),
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

    // Every branch ends up calling Claude (text classification or, for
    // screenshots, the pricier vision call), so this is the one place that
    // caps real per-request cost. Rolling 24h rather than calendar-day to
    // dodge timezone-boundary edge cases.
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

    const item = await processIncomingItem(parsed.data, userId);
    await logAnalyticsEvent({ eventType: "item_saved", userId, category: item.category, source: item.source });
    return reply.code(201).send(item);
  });

  // Recent items for the Home screen -- also its 즐겨찾기 tab (?pinned=true).
  app.get("/items", async (req, reply) => {
    const parsed = ListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid query", details: parsed.error.flatten() });
    }
    const userId = await resolveUserId(req);
    const { items, total } = await listItems(userId, {
      limit: parsed.data.limit,
      pinnedOnly: parsed.data.pinned,
    });
    return reply.send({ items, total });
  });

  // Search across title/snippet/raw text for the Search screen.
  app.get("/items/search", async (req, reply) => {
    const parsed = SearchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid query", details: parsed.error.flatten() });
    }
    const userId = await resolveUserId(req);
    const items = await searchItems(userId, parsed.data.q, parsed.data.limit);
    return reply.send({ items });
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

  // Home's 즐겨찾기 tab.
  app.post("/items/:id/pin", async (req, reply) => {
    const userId = await resolveUserId(req);
    const { id } = req.params as { id: string };
    try {
      const item = await pinItem(userId, id);
      return reply.send(item);
    } catch (err) {
      return reply.code(404).send({ error: err instanceof Error ? err.message : "pin failed" });
    }
  });

  app.delete("/items/:id/pin", async (req, reply) => {
    const userId = await resolveUserId(req);
    const { id } = req.params as { id: string };
    try {
      const item = await unpinItem(userId, id);
      return reply.send(item);
    } catch (err) {
      return reply.code(404).send({ error: err instanceof Error ? err.message : "unpin failed" });
    }
  });

  // Adds one user tag. The AI-assigned `tags` column has no route that can
  // touch it at all -- this only ever reads/writes user_tags.
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
}
