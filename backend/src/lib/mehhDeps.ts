import { config } from "../config.js";
import type { MehhDeps } from "../routes/mehh.js";
import { analyzeMehhDayPhotos, analyzeMehhScreenshots, isAiUnavailable } from "./anthropic.js";
import { dailyAiBudget } from "./aiLog.js";
import { ImageRejectedError, prepareMehhThumbnail } from "./image.js";
import { MehhNotVerifiedError, integrityReady, refundFree, reserveFree, startFree, verifyFree } from "./mehhFree.js";
import { MehhNotProError, mehhBillingReady, purchaseKey, refundMehhPhotos, requireMehhPro, reserveMehhPhotos } from "./mehhUsage.js";

// The real services behind routes/mehh.ts.
export const mehhDeps: MehhDeps = {
  billingReady: mehhBillingReady,
  aiReady: () => config.hasAnthropicKey && config.hasSupabase,
  purchaseKey,
  requirePro: (token, key, product) => requireMehhPro(token, key, product),
  NotPro: MehhNotProError,
  prepare: prepareMehhThumbnail,
  isImageRejected: (err): err is ImageRejectedError => err instanceof ImageRejectedError,
  reserve: (key, asked) => reserveMehhPhotos(key, asked),
  refund: refundMehhPhotos,
  assertAiOpen: () => dailyAiBudget.assertOpen(),
  isAiUnavailable,
  analyze: (images, today, kind) => (kind === "day" ? analyzeMehhDayPhotos(images) : analyzeMehhScreenshots(images, today)),
  integrityReady,
  verifyFree: (installId, nonce, token) => verifyFree(installId, nonce, token),
  NotVerified: MehhNotVerifiedError,
  startFree: (installId, kind) => startFree(installId, kind),
  reserveFree: (session, asked) => reserveFree(session, asked),
  refundFree,
  rateLimitMax: config.mehhRateLimitMax,
  rateLimitWindowMs: config.rateLimitWindowMs,
};
