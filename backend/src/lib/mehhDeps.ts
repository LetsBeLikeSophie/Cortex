import { config } from "../config.js";
import type { MehhDeps } from "../routes/mehh.js";
import { analyzeMehhScreenshots, isAiUnavailable } from "./anthropic.js";
import { dailyAiBudget } from "./aiLog.js";
import { ImageRejectedError, prepareMehhThumbnail } from "./image.js";
import { MehhNotProError, mehhBillingReady, purchaseKey, refundMehhPhotos, requireMehhPro, reserveMehhPhotos } from "./mehhUsage.js";

// The real services behind routes/mehh.ts.
export const mehhDeps: MehhDeps = {
  billingReady: mehhBillingReady,
  aiReady: () => config.hasAnthropicKey && config.hasSupabase,
  purchaseKey,
  requirePro: (token, key) => requireMehhPro(token, key),
  NotPro: MehhNotProError,
  prepare: prepareMehhThumbnail,
  isImageRejected: (err): err is ImageRejectedError => err instanceof ImageRejectedError,
  reserve: (key, asked) => reserveMehhPhotos(key, asked),
  refund: refundMehhPhotos,
  assertAiOpen: () => dailyAiBudget.assertOpen(),
  isAiUnavailable,
  analyze: analyzeMehhScreenshots,
  rateLimitMax: config.mehhRateLimitMax,
  rateLimitWindowMs: config.rateLimitWindowMs,
};
