import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { IncomingItemSchema, processIncomingItem } from "../lib/pipeline.js";
import { listItems, searchItems } from "../lib/supabase.js";
import { DEV_USER_ID } from "../lib/devUser.js";

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const SearchQuerySchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function itemsRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (_req, reply) => {
    if (!config.hasAnthropicKey) {
      reply.code(503).send({ error: "ANTHROPIC_API_KEY is not configured on the server" });
    } else if (!config.hasSupabase) {
      reply.code(503).send({ error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not configured on the server" });
    }
  });

  // Ingest a shared item from the mobile app's share extension.
  app.post("/items", async (req, reply) => {
    const parsed = IncomingItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid body", details: parsed.error.flatten() });
    }

    const item = await processIncomingItem(parsed.data);
    return reply.code(201).send(item);
  });

  // Recent items for the Home screen.
  app.get("/items", async (req, reply) => {
    const parsed = ListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid query", details: parsed.error.flatten() });
    }
    const { items, total } = await listItems(DEV_USER_ID, parsed.data.limit);
    return reply.send({ items, total });
  });

  // Search across title/snippet/raw text for the Search screen.
  app.get("/items/search", async (req, reply) => {
    const parsed = SearchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid query", details: parsed.error.flatten() });
    }
    const items = await searchItems(DEV_USER_ID, parsed.data.q, parsed.data.limit);
    return reply.send({ items });
  });
}
