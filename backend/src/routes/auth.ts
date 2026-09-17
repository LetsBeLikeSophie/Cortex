import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { loginWithKakaoCode } from "../lib/kakaoAuth.js";

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
}
