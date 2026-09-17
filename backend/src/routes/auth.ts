import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { deleteAccount, loginWithKakaoCode } from "../lib/kakaoAuth.js";
import { verifyAccessToken } from "../lib/auth.js";

const KakaoLoginSchema = z.object({
  code: z.string().min(1),
  redirectUri: z.string().min(1),
});

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

  // Account deletion. Deliberately doesn't fall back to DEV_USER_ID the way
  // resolveUserId() (used by the items routes) does for the no-header case
  // -- that fallback exists so the mobile app keeps working before it had
  // login at all, which is exactly the case where letting a bare,
  // unauthenticated request delete the shared dev account would be a real
  // footgun. This route requires an actual verified session, full stop.
  app.delete("/auth/me", async (req, reply) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "인증이 필요해요" });
    }
    const userId = await verifyAccessToken(header.slice("Bearer ".length));
    if (!userId) {
      return reply.code(401).send({ error: "유효하지 않은 세션이에요" });
    }

    try {
      await deleteAccount(userId);
      return reply.code(200).send({ ok: true });
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: err instanceof Error ? err.message : "delete failed" });
    }
  });
}
