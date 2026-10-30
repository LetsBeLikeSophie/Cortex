import type { FastifyInstance } from "fastify";
import { deleteUserAccount, findUserIdByEmail, findUserIdByKakaoId, logAnalyticsEvent } from "../lib/supabase.js";

interface KakaoUnlinkBody {
  app_id?: string;
  user_id?: string;
  referrer_type?: string;
}

// Kakao's "연결 해제 웹훅" (unlink webhook): fires when a user disconnects
// this app from *outside* it -- their Kakao account page, Kakao support, or
// deleting their Kakao account entirely. Without this, a person could
// delete their Kakao account and their Cortex data would just sit there
// forever with no way for them (or us) to know the login it depends on is
// gone. Docs: https://developers.kakao.com/docs/latest/ko/kakaologin/callback
export async function webhookRoutes(app: FastifyInstance) {
  app.post("/webhooks/kakao/unlink", async (req, reply) => {
    // Kakao signs every webhook request with the app's Admin Key so a
    // third party can't fake an unlink and get someone's account wiped.
    // Every response must still be 200 OK within 3s regardless of outcome
    // (bad auth, unknown user, internal error) -- anything else reads to
    // Kakao as "delivery failed" and gets retried, which would just repeat
    // whatever went wrong.
    const expected = `KakaoAK ${process.env.KAKAO_ADMIN_KEY ?? ""}`;
    if (!process.env.KAKAO_ADMIN_KEY || req.headers.authorization !== expected) {
      req.log.warn("kakao unlink webhook: missing or wrong admin-key auth header");
      return reply.code(200).send();
    }

    const body = req.body as KakaoUnlinkBody | undefined;
    const kakaoUserId = body?.user_id;
    if (!kakaoUserId) {
      req.log.warn({ body }, "kakao unlink webhook: no user_id in payload");
      return reply.code(200).send();
    }

    try {
      // kakao_users first (one row lookup); accounts older than that table
      // are found by the synthetic email from kakaoAuth.ts.
      const userId =
        (await findUserIdByKakaoId(Number(kakaoUserId))) ?? (await findUserIdByEmail(`kakao-${kakaoUserId}@users.cortex.app`));
      if (userId) {
        // Kakao login is the only way into this account, so "unlink" here
        // means the account itself is gone -- delete their items and
        // screenshots too rather than leaving them orphaned under a
        // user_id nothing can ever authenticate as again.
        await logAnalyticsEvent({ eventType: "account_deleted", userId });
        await deleteUserAccount(userId);
        req.log.info({ kakaoUserId, referrerType: body?.referrer_type }, "kakao unlink webhook: account deleted");
      } else {
        req.log.info({ kakaoUserId }, "kakao unlink webhook: no matching account, nothing to do");
      }
    } catch (err) {
      req.log.error(err, "kakao unlink webhook: cleanup failed");
    }

    return reply.code(200).send();
  });
}
