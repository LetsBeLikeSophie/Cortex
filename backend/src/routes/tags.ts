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

// 태그 정리하기 (suggest): one run per person at a time.
const cleaning = new Set<string>();

export async function tagRoutes(app: FastifyInstance) {
  // Tag lock: which tags are locked, and how many the plan allows (null: no
  // limit). The PIN stays on the device, like the memo lock.
  app.get("/tags/locked", async (req, reply) => {
    const userId = await resolveUserId(req);
    const [tags, ent] = await Promise.all([listLockedTags(userId), getEntitlement(userId)]);
    return reply.send({ tags, limit: ent.tier === "free" ? FREE_LOCKED_TAGS : null });
  });

  // Locking a second tag on free answers 403 tag_lock_limit; the app offers
  // Pro for it (TagLockButton).
  app.post("/tags/lock", async (req, reply) => {
    const parsed = z.object({ tag: z.string().trim().min(1).max(100), locked: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    const userId = await resolveUserId(req);
    const { tag, locked } = parsed.data;
    if (locked) {
      const [current, ent] = await Promise.all([listLockedTags(userId), getEntitlement(userId)]);
      if (!current.includes(tag) && !canLockAnotherTag(ent.tier, current.length)) {
        return reply.code(403).send({ error: "tag_lock_limit", limit: FREE_LOCKED_TAGS });
      }
      await lockTag(userId, tag);
    } else {
      await unlockTag(userId, tag);
    }
    return reply.send({ ok: true, tags: await listLockedTags(userId) });
  });

  // 태그 정리하기, step 1: the AI proposes groups from tag names only.
  // Metered; nothing changes until step 2.
  app.post("/tags/cleanup/suggest", { config: { rateLimit: {} } }, async (req, reply) => {
    const userId = await resolveUserId(req);
    await requireAiConsent(userId);
    const run = await withUserLock(cleaning, userId, async () => {
      const ent = await getEntitlement(userId);
      if (remaining(ent, "tag_cleanup") === 0) {
        return quotaHit(reply, userId, ent, "tag_cleanup");
      }
      const tags = await listTagCounts(userId);
      if (tags.length < 2) return reply.send({ groups: [], left: remaining(ent, "tag_cleanup") });
      await dailyAiBudget.assertOpen();
      const reservation = await reserveUsage(userId, "tag_cleanup");
      try {
        const groups = await suggestTagMerges(tags.slice(0, 400), userId, normalizeLang(req.headers["x-cortex-lang"]) ?? ent.lang ?? DEFAULT_LANG);
        // Nothing to tidy -> the use is handed back.
        if (groups.length === 0) await refundUsage(reservation).catch(() => {});
        const counts = new Map(tags.map((t) => [t.name, t.count]));
        const sizes = groups.length ? await tagGroupCounts(userId, groups) : [];
        return reply.send({
          groups: groups.map((g, i) => ({
            ...g,
            counts: Object.fromEntries([g.keep, ...g.merge].map((n) => [n, counts.get(n) ?? 0])),
            after: sizes[i].after,
            changes: sizes[i].changes,
          })),
          left: remaining(ent, "tag_cleanup") - (groups.length === 0 ? 0 : 1),
        });
      } catch (err) {
        await refundUsage(reservation).catch(() => {});
        throw err;
      }
    });
    if (run.busy) return reply.code(409).send({ error: "cleanup_running" });
    return run.value;
  });

  // 태그 정리하기, step 2: merge the groups the person ticked (free).
  app.post("/tags/cleanup/apply", async (req, reply) => {
    const parsed = z
      .object({ groups: z.array(z.object({ keep: z.string().trim().min(1).max(30), merge: z.array(z.string().trim().min(1).max(60)).min(1).max(50) })).min(1).max(20) })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    const userId = await resolveUserId(req);
    const changed = await mergeTags(userId, parsed.data.groups);
    return reply.send({ ok: true, changed });
  });
}
