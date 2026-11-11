import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { resyncLapsedPurchases } from "../lib/billing.js";
import { onlyStackFrames, safeErrorName } from "../lib/appErrors.js";
import { ImageRejectedError } from "../lib/image.js";
import { isPlayBillingConfigured } from "../lib/googlePlay.js";
import { config } from "../config.js";
import { CATEGORIES } from "../lib/categories.js";
import { IncomingItemSchema, classifyBacklog, processIncomingItem, reorganizeItem } from "../lib/pipeline.js";
import { AiConsentRequiredError, type Entitlement, type UsageKind, getEntitlement, refundUsage, remaining, requireAiConsent, reserveUsage, setAiConsent, syncLang, withPlanDetails } from "../lib/plans.js";
import { dailyAiBudget } from "../lib/aiLog.js";
import { clipInterpretation, composeFromItems, DEFAULT_LANG, interpretSearch, isAiUnavailable, normalizeLang, suggestTagMerges, SearchInterpretationSchema } from "../lib/anthropic.js";
import {
  addUserTag,
  countItemsSince,
  getScreenshotUrl,
  getStats,
  KST_OFFSET_MINUTES,
  logAnalyticsEvent,
  logAppError,
  listItems,
  listAllItems,
  listLookback,
  listTags,
  listTrash,
  permanentlyDeleteItem,
  removeAiTag,
  removeUserTag,
  restoreItem,
  searchItems,
  getItemForUser,
  insertItem,
  listItemsByIds,
  getClient,
  countSavedSince,
  listItemsWithTag,
  listUnclassifiedItems,
  updateItemText,
  searchItemsSmart,
  trashItem,
  reportAiOutput,
  setItemLocked,
  unlockAllItems,
  listTagCounts,
  mergeTags,
  tagGroupCounts,
  listLockedTags,
  lockTag,
  unlockTag,
  syncTagLock,
} from "../lib/supabase.js";
import { canLockAnotherTag, FREE_LOCKED_TAGS } from "../lib/tagLock.js";
import { withUserLock } from "../lib/userLock.js";
import { resolveUserId, UnauthorizedError } from "../lib/auth.js";
import { quotaHit } from "./quota.js";

// The privacy policy revision of 2026-11-07 takes effect 2026-11-14 (KST).
const APP_ERRORS_FROM = Date.parse("2026-11-14T00:00:00+09:00");

// What the app reports on the way to Pro; anything else is refused, so this
// can't turn into a place to send free text.
const AppErrorSchema = z.object({
  appVersion: z.string().max(32),
  name: z.string().max(200),
  stack: z.string().max(16_000),
});

const AppEventSchema = z.union([
  z.object({
    type: z.enum(["paywall_view", "purchase_started"]),
    detail: z.enum(["default", "classify", "search", "compose", "tag_cleanup", "trial_ending", "trial_ended", "monthly", "yearly", "lifetime"]),
  }),
  // Play's own refusal in the app ("play:<code>"), a code, never a message.
  z.object({ type: z.literal("purchase_failed"), detail: z.string().regex(/^play:[a-z0-9_-]{1,40}$/) }),
]);

export async function meRoutes(app: FastifyInstance) {
  // Plan + this month's AI usage, for the app's quota/미분류함 UI.
  app.get("/me/plan", async (req, reply) => {
    const userId = await resolveUserId(req);
    // The app sends its device language here; AI output follows it.
    if (isPlayBillingConfigured()) await resyncLapsedPurchases(userId).catch((err) => req.log.error(err));
    await syncLang(userId, normalizeLang(req.headers["x-cortex-lang"])).catch((err) => req.log.warn(err));
    return reply.send(await withPlanDetails(userId));
  });

  app.post("/me/event", async (req, reply) => {
    const parsed = AppEventSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    const userId = await resolveUserId(req);
    await logAnalyticsEvent({ eventType: parsed.data.type, userId, detail: parsed.data.detail });
    return reply.code(204).send();
  });

  // Where the app broke (decision E1). Signed in so it can't be spammed from
  // outside, but no account is stored.
  app.post("/me/error", { config: { rateLimit: {} } }, async (req, reply) => {
    const parsed = AppErrorSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    await resolveUserId(req);
    // Kept only from the day the privacy policy that lists it takes effect.
    if (Date.now() < APP_ERRORS_FROM) return reply.code(204).send();
    const stack = onlyStackFrames(parsed.data.stack);
    if (stack) await logAppError({ appVersion: parsed.data.appVersion, name: safeErrorName(parsed.data.name), stack }).catch((err) => req.log.error(err));
    return reply.code(204).send();
  });

  // The answer to "send saved content to the AI abroad?" -- recorded with
  // time and notice version; changeable any time from the profile.
  app.post("/me/ai-consent", async (req, reply) => {
    const parsed = z.object({ agree: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    const userId = await resolveUserId(req);
    await setAiConsent(userId, parsed.data.agree);
    return reply.send(await getEntitlement(userId));
  });
}
