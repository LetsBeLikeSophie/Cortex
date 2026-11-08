import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { z } from "zod";
import { resultsFor, type MehhResult } from "../lib/mehhRules.js";

// POST /mehh/screenshots/analyze -- Mehh Pro's screenshot AI
// (docs/mehh-screenshot-ai.md). Mehh sends small thumbnails of the
// screenshots its on-device check found unclear (never ones with a face),
// with its Play purchase token; the answer is a verdict and a reason label
// per photo. Thumbnails stay in this request's memory and are dropped when it
// ends: no file, no Storage, no log line carries them.
//
// Everything that reaches Google, Claude or the database comes in as deps,
// so the route is tested with fakes (mehh.test.ts) and server.ts wires the
// real ones (lib/mehhDeps.ts).

export const MEHH_MAX_PHOTOS = 10;

const PhotoSchema = z.object({
  // Mehh's own handle for the photo in this batch (not a file name or path).
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  // base64 JPEG/PNG/WebP, up to ~300KB decoded (checked again after decoding).
  image: z.string().min(1).max(420_000),
});

const BodySchema = z.object({
  purchaseToken: z.string().min(1).max(2000),
  // The phone's local date, for "is this coupon past its date".
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  photos: z.array(PhotoSchema).min(1).max(MEHH_MAX_PHOTOS),
});

export interface MehhReservation {
  id: number | null;
  granted: number;
  used: number;
  limit: number;
  resetsAt: string;
}

export interface MehhDeps {
  billingReady(): boolean;
  aiReady(): boolean;
  purchaseKey(token: string): string;
  // Throws deps.NotPro when the token isn't a live Mehh Pro purchase.
  requirePro(token: string, key: string): Promise<void>;
  NotPro: new (...args: never[]) => Error;
  // Throws an ImageRejected-like error ({ status: 400 | 413 }) for a bad image.
  prepare(bytes: Buffer): Promise<Buffer>;
  isImageRejected(err: unknown): err is { status: 400 | 413 };
  reserve(key: string, asked: number): Promise<MehhReservation>;
  refund(id: number): Promise<void>;
  assertAiOpen(): Promise<void>;
  isAiUnavailable(err: unknown): boolean;
  analyze(images: Buffer[], today: string): Promise<{ index: number; verdict: string; reason: string }[]>;
  rateLimitMax: number;
  rateLimitWindowMs: number;
}

// The rate limit counts per purchase (not per IP, which can be a whole
// carrier); a body without a token falls back to the IP.
function rateKey(req: { body?: unknown; ip: string }): string {
  const token = (req.body as { purchaseToken?: unknown } | undefined)?.purchaseToken;
  return typeof token === "string" && token ? `mehh:${createHash("sha256").update(token).digest("hex")}` : `mehh-ip:${req.ip}`;
}

export function mehhRoutes(deps: MehhDeps) {
  return async function register(app: FastifyInstance) {
    app.post(
      "/mehh/screenshots/analyze",
      { config: { rateLimit: { max: deps.rateLimitMax, timeWindow: deps.rateLimitWindowMs, keyGenerator: rateKey } } },
      async (req, reply) => {
        const parsed = BodySchema.safeParse(req.body);
        if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });
        const { purchaseToken, today, photos } = parsed.data;
        if (new Set(photos.map((p) => p.id)).size !== photos.length) return reply.code(400).send({ error: "invalid_body" });
        if (!deps.billingReady()) return reply.code(503).send({ error: "billing_unavailable" });
        if (!deps.aiReady()) return reply.code(503).send({ error: "ai_unavailable" });

        const key = deps.purchaseKey(purchaseToken);
        try {
          await deps.requirePro(purchaseToken, key);
        } catch (err) {
          if (err instanceof deps.NotPro) return reply.code(401).send({ error: "not_pro" });
          req.log.error(err, "mehh: Play check failed");
          return reply.code(503).send({ error: "billing_unavailable" });
        }

        // Decode and re-encode before anything is counted: a bad image costs nothing.
        let images: Buffer[];
        try {
          images = [];
          for (const p of photos) images.push(await deps.prepare(Buffer.from(p.image, "base64")));
        } catch (err) {
          if (deps.isImageRejected(err)) {
            return reply.code(err.status).send({ error: err.status === 413 ? "image_too_large" : "unreadable_image" });
          }
          throw err;
        }

        try {
          await deps.assertAiOpen();
        } catch {
          return reply.code(503).send({ error: "ai_unavailable" });
        }

        const r = await deps.reserve(key, photos.length);
        const usage = { used: r.used, limit: r.limit, resetsAt: r.resetsAt };
        if (r.granted === 0) return reply.code(402).send({ error: "quota", ...usage });

        const sent = photos.slice(0, r.granted);
        let results: MehhResult[];
        try {
          const answer = await deps.analyze(images.slice(0, r.granted), today);
          results = resultsFor(
            sent.map((p) => p.id),
            answer
          );
        } catch (err) {
          if (r.id !== null) await deps.refund(r.id).catch((e) => req.log.error(e, "mehh: refund failed"));
          if (deps.isAiUnavailable(err)) return reply.code(503).send({ error: "ai_unavailable" });
          req.log.error(err, "mehh: analyze failed");
          return reply.code(502).send({ error: "ai_failed" });
        } finally {
          images.length = 0;
        }

        // Photos past this month's cap: Mehh keeps them for next month.
        const skipped = photos.slice(r.granted).map((p) => p.id);
        return reply.send({ results, skipped, usage });
      }
    );
  };
}
