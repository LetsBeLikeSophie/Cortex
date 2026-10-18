import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { deleteAccount, loginWithKakaoCode } from "../lib/kakaoAuth.js";
import { verifyAccessToken } from "../lib/auth.js";
import { countItemsSince, seedSampleItem } from "../lib/supabase.js";

const KakaoLoginSchema = z.object({
  code: z.string().min(1),
  redirectUri: z.string().min(1),
});

// Both routes below need an actual verified session and nothing looser --
// a shared, explicit check rather than resolveUserId() (used by the items
// routes, which does fall back to throwing rather than any shared-account
// fallback) just so a bug there can never accidentally loosen what these
// two require.
async function requireVerifiedUserId(req: FastifyRequest): Promise<string | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return verifyAccessToken(header.slice("Bearer ".length));
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/kakao", async (req, reply) => {
    const parsed = KakaoLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid body", details: parsed.error.flatten() });
    }

    try {
      const result = await loginWithKakaoCode(parsed.data.code, parsed.data.redirectUri);
      return reply.send(result);
    } catch (err) {
      req.log.error(err);
      return reply.code(401).send({ error: err instanceof Error ? err.message : "kakao login failed" });
    }
  });

  app.delete("/auth/me", async (req, reply) => {
    const userId = await requireVerifiedUserId(req);
    if (!userId) {
      return reply.code(401).send({ error: "인증이 필요해요" });
    }

    try {
      await deleteAccount(userId);
      return reply.code(200).send({ ok: true });
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: err instanceof Error ? err.message : "delete failed" });
    }
  });

  // Guest (anonymous Supabase auth) accounts skip the whole Kakao login
  // route above, so they'd otherwise never get the sample item Kakao signup
  // seeds on account creation -- called once from LoginScreen right after
  // signInAnonymously() succeeds. Guarded by an item-count check rather than
  // trusting "only ever called once" -- a retry after a dropped response
  // shouldn't leave someone with two sample items.
  app.post("/auth/seed-sample", async (req, reply) => {
    const userId = await requireVerifiedUserId(req);
    if (!userId) {
      return reply.code(401).send({ error: "인증이 필요해요" });
    }

    try {
      const existing = await countItemsSince(userId, new Date(0).toISOString());
      if (existing === 0) await seedSampleItem(userId);
      return reply.code(200).send({ ok: true });
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: err instanceof Error ? err.message : "seed failed" });
    }
  });
}
