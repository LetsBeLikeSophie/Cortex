import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { z } from "zod";
import { resultsFor, type MehhKind, type MehhProduct, type MehhResult } from "../lib/mehhRules.js";

// POST /mehh/free/start -- a free Mehh install spends one AI coin on one
// session (one day set, or one screenshot run), after Play Integrity shows
// it is the real Mehh from Google Play on a real device (Sophie 11-14).
// POST /mehh/screenshots/analyze -- Mehh's AI (screenshots and, with
// kind "day", photos from one day)
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

const KindSchema = z.enum(["screenshots", "day"]).default("screenshots");

const BodySchema = z.object({
  // Pro: the Play purchase token. Free: the session from /mehh/free/start.
  // Exactly one of the two.
  purchaseToken: z.string().min(1).max(2000).optional(),
  session: z.string().uuid().optional(),
  kind: KindSchema,
  // Which Mehh Pro product the token is for. Older Mehh builds send none
  // (they only send the lifetime pass).
  productId: z.enum(["mehh_pro_lifetime", "mehh_pro_3months"]).default("mehh_pro_lifetime"),
  // The phone's local date, for "is this coupon past its date".
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  photos: z.array(PhotoSchema).min(1).max(MEHH_MAX_PHOTOS),
});

const FreeStartSchema = z.object({
  // A random id Mehh made at install (only its SHA-256 is kept).
  installId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  // Fresh per ask; with installId it makes the Integrity request hash.
  nonce: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  integrityToken: z.string().min(1).max(8000),
  kind: KindSchema,
});

export interface FreeStart {
  session: string | null; // null: no coin left
  coins: number; // left after this
  nextCoinAt: string; // when the next monthly coin comes
}

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
  requirePro(token: string, key: string, product: MehhProduct): Promise<void>;
  NotPro: new (...args: never[]) => Error;
  // Throws an ImageRejected-like error ({ status: 400 | 413 }) for a bad image.
  prepare(bytes: Buffer): Promise<Buffer>;
  isImageRejected(err: unknown): err is { status: 400 | 413 };
  reserve(key: string, asked: number): Promise<MehhReservation>;
  refund(id: number): Promise<void>;
  assertAiOpen(): Promise<void>;
  isAiUnavailable(err: unknown): boolean;
  analyze(images: Buffer[], today: string, kind: MehhKind): Promise<{ index: number; verdict: string; reason: string }[]>;
  // Free coins. verifyFree throws deps.NotVerified when Integrity says no
  // (emulator, not from Play, another app, a stale token).
  integrityReady(): boolean;
  verifyFree(installId: string, nonce: string, integrityToken: string): Promise<void>;
  NotVerified: new (...args: never[]) => Error;
  startFree(installId: string, kind: MehhKind): Promise<FreeStart>;
  // Room for a batch in a free session (granted 0 when it is gone or used up).
  reserveFree(session: string, asked: number): Promise<{ granted: number; used: number; limit: number; resetsAt: string }>;
  refundFree(session: string, photos: number): Promise<void>;
  rateLimitMax: number;
  rateLimitWindowMs: number;
}

// The rate limit counts per purchase (not per IP, which can be a whole
// carrier); a body without a token falls back to the IP.
function rateKey(req: { body?: unknown; ip: string }): string {
  const b = req.body as { purchaseToken?: unknown; session?: unknown; installId?: unknown } | undefined;
  const id = [b?.purchaseToken, b?.session, b?.installId].find((v) => typeof v === "string" && v);
  return id ? `mehh:${createHash("sha256").update(id as string).digest("hex")}` : `mehh-ip:${req.ip}`;
}

export function mehhRoutes(deps: MehhDeps) {
  return async function register(app: FastifyInstance) {
    app.post(
      "/mehh/free/start",
      { config: { rateLimit: { max: deps.rateLimitMax, timeWindow: deps.rateLimitWindowMs, keyGenerator: rateKey } } },
      async (req, reply) => {
        const parsed = FreeStartSchema.safeParse(req.body);
        if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });
        const { installId, nonce, integrityToken, kind } = parsed.data;
        if (!deps.integrityReady()) return reply.code(503).send({ error: "integrity_unavailable" });
        if (!deps.aiReady()) return reply.code(503).send({ error: "ai_unavailable" });
        try {
          await deps.verifyFree(installId, nonce, integrityToken);
        } catch (err) {
          if (err instanceof deps.NotVerified) return reply.code(403).send({ error: "not_verified" });
          req.log.error(err, "mehh: Integrity check failed");
          return reply.code(503).send({ error: "integrity_unavailable" });
        }
        const r = await deps.startFree(installId, kind);
        if (!r.session) return reply.code(402).send({ error: "no_coins", coins: r.coins, nextCoinAt: r.nextCoinAt });
        return reply.send(r);
      }
    );

    app.post(
      "/mehh/screenshots/analyze",
      { config: { rateLimit: { max: deps.rateLimitMax, timeWindow: deps.rateLimitWindowMs, keyGenerator: rateKey } } },
      async (req, reply) => {
        const parsed = BodySchema.safeParse(req.body);
        if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });
        const { purchaseToken, session, kind, productId, today, photos } = parsed.data;
        if (!purchaseToken === !session) return reply.code(400).send({ error: "invalid_body" });
        const product: MehhProduct = productId === "mehh_pro_3months" ? "trial" : "lifetime";
        if (new Set(photos.map((p) => p.id)).size !== photos.length) return reply.code(400).send({ error: "invalid_body" });
        if (purchaseToken && !deps.billingReady()) return reply.code(503).send({ error: "billing_unavailable" });
        if (!deps.aiReady()) return reply.code(503).send({ error: "ai_unavailable" });

        const key = purchaseToken ? deps.purchaseKey(purchaseToken) : "";
        if (purchaseToken) {
          try {
            await deps.requirePro(purchaseToken, key, product);
          } catch (err) {
            if (err instanceof deps.NotPro) return reply.code(401).send({ error: "not_pro" });
            req.log.error(err, "mehh: Play check failed");
            return reply.code(503).send({ error: "billing_unavailable" });
          }
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

        // Pro: this month's room. Free: what is left of this coin's session
        // (used up or expired answers "quota"; the app then asks for a new coin).
        const r = session ? { id: null, ...(await deps.reserveFree(session, photos.length)) } : await deps.reserve(key, photos.length);
        const usage = { used: r.used, limit: r.limit, resetsAt: r.resetsAt };
        if (r.granted === 0) return reply.code(402).send({ error: "quota", ...usage });

        const sent = photos.slice(0, r.granted);
        let results: MehhResult[];
        try {
          const answer = await deps.analyze(images.slice(0, r.granted), today, kind);
          results = resultsFor(
            sent.map((p) => p.id),
            answer,
            kind
          );
        } catch (err) {
          if (r.id !== null) await deps.refund(r.id).catch((e) => req.log.error(e, "mehh: refund failed"));
          if (session) await deps.refundFree(session, r.granted).catch((e) => req.log.error(e, "mehh: free refund failed"));
          if (deps.isAiUnavailable(err)) return reply.code(503).send({ error: "ai_unavailable" });
          req.log.error(err, "mehh: analyze failed");
          return reply.code(502).send({ error: "ai_failed" });
        } finally {
          images.length = 0;
        }

        // Photos past the cap: Mehh keeps them for later (next month, or a new coin).
        const skipped = photos.slice(r.granted).map((p) => p.id);
        return reply.send({ results, skipped, usage });
      }
    );
  };
}
