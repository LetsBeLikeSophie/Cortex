import { z } from "zod";
import { compressScreenshot } from "./image.js";
import { createSlots } from "./slots.js";
import { dailyAiBudget } from "./aiLog.js";
import { fetchLinkMetadata } from "./metadata.js";
import { classifyText, classifyImage, isAiUnavailable } from "./anthropic.js";
import type { Category } from "./categories.js";
import { getAiGate, getEntitlement, refundUsage, remaining, reserveUsage, reserveUsageMany } from "./plans.js";
import {
  ClassificationStatus,
  completeClassification,
  downloadScreenshot,
  listBacklogItems,
  countBacklog,
  getClassifyGate,
  markBacklogPending,
  markClassificationPending,
  listPendingItems,
  markUnclassified,
  insertItem,
  DuplicateRequestError,
  findItemByRequestId,
  logAnalyticsEvent,
  uploadScreenshot,
  listFrequentTags,
  ItemRecord,
  ItemSource,
} from "./supabase.js";

const SOURCES = ["instagram", "kakaotalk", "safari", "youtube", "memo", "other"] as const satisfies readonly ItemSource[];

// The app's id for one save, the same on every retry of it (decision UX-64):
// a retry after a timeout returns the item the first try already made.
const RequestIdSchema = z.string().min(8).max(100).optional();

export const IncomingItemSchema = z.discriminatedUnion("captureType", [
  z.object({
    captureType: z.literal("link"),
    source: z.enum(SOURCES),
    url: z.string().url(),
    note: z.string().max(1000).optional(),
    requestId: RequestIdSchema,
  }),
  z.object({
    captureType: z.literal("text"),
    source: z.enum(SOURCES),
    // Kept whole up to here; only the first part goes to the AI.
    text: z.string().min(1).max(200_000),
    note: z.string().max(1000).optional(),
    requestId: RequestIdSchema,
  }),
  z.object({
    captureType: z.literal("screenshot"),
    source: z.enum(SOURCES),
    imageBase64: z.string().min(1),
    mediaType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
    note: z.string().max(1000).optional(),
    requestId: RequestIdSchema,
  }),
]);

export type IncomingItem = z.infer<typeof IncomingItemSchema>;

// A placeholder, not a guess -- every row starts here (classificationStatus
// 'pending') the instant it's saved, before Claude is ever called. The
// client shows this category/empty tags as "분석 중" rather than as the
// real result; completeClassification overwrites all of it once the real
// call resolves.
const PENDING_CATEGORY = "기타" as const;

// The three-branch pipeline discussed in the product conversation:
// link -> og:tags/oEmbed, text -> shared straight through, screenshot ->
// Claude vision -- all three converge on the same classifyText/classifyImage
// call so every item ends up with a title/snippet/category/tags. Each
// branch returns as soon as the row exists and classifies in the background
// (see the queue below) -- unless the month's AI classification quota is
// used up: then the item still saves, as 'unclassified', with no Claude call
// at all, and waits in the app's 미분류함 (see classifyBacklog).
export async function processIncomingItem(input: IncomingItem, userId: string): Promise<ItemRecord> {
  // A retry of a save that already went through (the app timed out waiting,
  // or the Mehh queue re-uploads): hand back that item -- no second row, no
  // second classification against the quota.
  let requestId = input.requestId;
  if (requestId) {
    const existing = await findItemByRequestId(userId, requestId);
    if (existing) return existing;
    if (existing === undefined) requestId = undefined; // column not migrated yet
  }
  // The quota is reserved here, the moment the save is accepted -- not when
  // the classification finishes -- so a 30-photo batch counts as 30 right
  // away. Parallel uploads can each see one slot left and overshoot by a
  // couple; acceptable for a soft monthly quota. Nothing goes to the AI
  // without the person's consent (ai_consent) -- and if the lookup itself
  // breaks, that can't be confirmed, so the item saves and waits instead.
  let classifyNow = false;
  let waitReason: "quota" | "consent" | "failed" = "failed";
  let reservation: number | null = null;
  try {
    const ent = await getEntitlement(userId);
    if (ent.aiConsent !== "agreed") waitReason = "consent";
    else if (remaining(ent, "classify") === 0) {
      waitReason = "quota";
      await logAnalyticsEvent({ eventType: "quota_hit", userId, detail: "classify" });
    } else {
      classifyNow = true;
      reservation = await reserveUsage(userId, "classify");
    }
  } catch (err) {
    console.error("plan lookup failed, saving without classifying:", err);
    classifyNow = false;
  }
  const status: ClassificationStatus = classifyNow ? "pending" : "unclassified";
  const base = {
    userId,
    source: input.source,
    userNote: input.note,
    category: PENDING_CATEGORY,
    tags: [],
    classificationStatus: status,
    unclassifiedReason: classifyNow ? undefined : waitReason,
    clientRequestId: requestId,
  };

  let item: ItemRecord;
  let imageBase64: string | undefined;
  try {
    if (input.captureType === "link") {
      item = await insertItem({ ...base, captureType: "link", rawUrl: input.url });
    } else if (input.captureType === "text") {
      item = await insertItem({ ...base, captureType: "text", rawText: input.text });
    } else {
      // The Storage upload stays synchronous -- it's a plain file write (fast),
      // and image_path has to exist for the row to show a thumbnail at all.
      // Only the Claude vision call (the slow part) moves to the background.
      const compressed = await compressScreenshot(Buffer.from(input.imageBase64, "base64"));
      const imagePath = await uploadScreenshot(userId, compressed, "image/jpeg");
      item = await insertItem({ ...base, captureType: "screenshot", imagePath });
      imageBase64 = compressed.toString("base64");
    }
  } catch (err) {
    // Nothing was saved, so the quota hold goes back.
    if (reservation !== null) await refundUsage(reservation).catch((e) => console.error("refundUsage failed:", e));
    // Two tries of the same save raced past the lookup: the other one won.
    // Return what it made.
    if (err instanceof DuplicateRequestError && requestId) {
      const existing = await findItemByRequestId(userId, requestId);
      if (existing) return existing;
    }
    throw err;
  }

  if (classifyNow) {
    enqueueClassification({
      item,
      imageBase64,
      reservation,
      onDone: (category) => logAnalyticsEvent({ eventType: "item_saved", userId, category, source: input.source }),
    });
  } else {
    await logAnalyticsEvent({ eventType: "item_saved", userId, source: input.source });
  }
  return item;
}

// Runs the classification for one stored row. Works for a fresh save
// (imageBase64 already in hand) and for a deferred 미분류함 item (re-reads
// link metadata / the stored screenshot). Quota is handled by the caller.
// What the person has written about an item themselves: their save note,
// and -- on an explicit re-organize -- the title/memo as they left them
// (possibly edited or cleared; cleared means "no hint").
function hintFor(item: ItemRecord, includeText: boolean): string | undefined {
  const parts = [
    includeText && item.title ? `제목: ${item.title}` : null,
    includeText && item.snippet ? `메모: ${item.snippet}` : null,
    item.user_note ? `저장할 때 남긴 말: ${item.user_note}` : null,
    // Always: the tags the person put on it themselves are a strong read of
    // what it is to them, and the AI shouldn't hand them back as its own.
    item.user_tags.length ? `내가 단 태그: ${item.user_tags.join(", ")}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join("\n") : undefined;
}

async function classifyAndComplete(item: ItemRecord, imageBase64?: string, useEditsAsHint = false, lang?: string) {
  const hint = hintFor(item, useEditsAsHint);
  // Best effort: without the list the item still classifies, just without
  // the nudge toward existing tags.
  const knownTags = await listFrequentTags(item.user_id).catch(() => []);
  let classification;
  let thumbnailUrl: string | undefined;
  if (item.capture_type === "link" && item.raw_url) {
    const meta = await fetchLinkMetadata(item.raw_url);
    classification = {
      ...(await classifyText({
        source: item.source,
        url: item.raw_url,
        title: meta.title,
        description: meta.description,
        siteName: meta.siteName,
        creatorTags: meta.tags,
        durationSec: meta.durationSec,
        // Only where the thumbnail tends to carry the content's words
        // (YouTube); a generic og:image is usually just a logo.
        imageUrl: meta.analyzeImage ? meta.imageUrl : undefined,
        hint,
        knownTags,
        userId: item.user_id,
        lang,
      })),
      keyText: undefined,
      hasText: undefined,
    };
    // og:image/oEmbed's thumbnail -- fetched alongside the classification
    // since both depend on the same metadata call.
    thumbnailUrl = meta.imageUrl;
  } else if (item.capture_type === "screenshot" && item.image_path) {
    const b64 = imageBase64 ?? (await downloadScreenshot(item.image_path)).toString("base64");
    classification = await classifyImage({ source: item.source, imageBase64: b64, mediaType: "image/jpeg", hint, knownTags, userId: item.user_id, lang });
  } else {
    // keyText is a screenshot-only field -- dropped here so a text memo's
    // own raw_text can never be overwritten by it.
    classification = { ...(await classifyText({ source: item.source, rawText: item.raw_text ?? "", hint, knownTags, userId: item.user_id, lang })), keyText: undefined, hasText: undefined };
  }
  await completeClassification(item.id, item.user_id, classification, thumbnailUrl);
  return classification.category;
}

// "AI로 정리": classifies as much of the 미분류함 backlog as this month's
// quota allows, oldest first. Quota is reserved and rows flip to 'pending'
// up front (the app shows them as 분석 중 and the count right away); the
// Claude calls then go through the same queue as fresh saves.
export async function classifyBacklog(userId: string): Promise<{ started: number; left: number }> {
  const ent = await getEntitlement(userId);
  const budget = remaining(ent, "classify");
  // Locked memos never go, so "left" doesn't count them either -- the number
  // after the run matches what a next run could still pick up.
  if (budget === 0) return { started: 0, left: await countBacklog(userId) };
  const picked = await listBacklogItems(userId, budget);
  const items = await markBacklogPending(userId, picked.map((it) => it.id));
  const reservations = await reserveUsageMany(userId, "classify", items.length);
  items.forEach((item, i) => enqueueClassification({ item, reservation: reservations[i] ?? null, background: true }));
  return { started: items.length, left: await countBacklog(userId) };
}

// "AI로 다시 정리" on one item: uses one classification from the quota and
// re-runs it with the person's current title/memo as a hint. Returns false
// when the quota is used up (the route answers 402).
export async function reorganizeItem(userId: string, item: ItemRecord): Promise<boolean> {
  const ent = await getEntitlement(userId);
  if (remaining(ent, "classify") === 0) return false;
  const reservation = await reserveUsage(userId, "classify");
  await markClassificationPending(item.id, userId);
  enqueueClassification({ item, reservation, useEditsAsHint: true });
  return true;
}

// ---- Classification queue -------------------------------------------------
// A burst (30 photos at once) used to fire 30 Claude calls in parallel on a
// 1 OCPU box. Now at most MAX_CONCURRENT run at a time; the rest wait their
// turn. A failed call is retried (transient API/network errors are the usual
// cause); only after every attempt fails is the reserved quota handed back
// and the item parked in 미분류함, where "AI로 정리" can pick it up later.
const MAX_CONCURRENT = 3;
const RETRY_DELAYS_MS = [3_000, 15_000];

interface ClassificationJob {
  item: ItemRecord;
  imageBase64?: string;
  // Re-organize request: the item's current title/memo go in as a hint.
  useEditsAsHint?: boolean;
  reservation: number | null;
  onDone?: (category: Category) => Promise<void>;
  // Backlog or restart work: waits behind anything a person just asked for.
  background?: boolean;
}

const withSlot = createSlots(MAX_CONCURRENT);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function enqueueClassification(job: ClassificationJob): void {
  void runJob(job);
}

async function runJob(job: ClassificationJob): Promise<void> {
  const { item } = job;
  // Last gate before anything leaves for the AI: consent may have been
  // withdrawn since the job was queued (or before a restart re-queued it).
  // Read inside a slot, so a restart's hundreds of jobs don't all hit the
  // database at once. A lookup that fails can't confirm consent: the item
  // waits with reason 'failed' (not 'consent' -- they may well have agreed).
  const ent = await withSlot(() => getAiGate(item.user_id), job.background).catch(() => null);
  if (ent?.aiConsent !== "agreed") {
    if (job.reservation !== null) await refundUsage(job.reservation).catch((e) => console.error("refundUsage failed:", e));
    await markUnclassified(item.id, item.user_id, ent ? "consent" : "failed").catch((e) => console.error("markUnclassified failed:", e));
    return;
  }
  // Locked or trashed since it was queued: it stays here, use handed back.
  const gate = await withSlot(() => getClassifyGate(item.id), job.background).catch(() => undefined);
  if (gate === null) {
    if (job.reservation !== null) await refundUsage(job.reservation).catch((e) => console.error("refundUsage failed:", e));
    return;
  }
  if (gate === undefined || gate.locked || gate.deleted) {
    if (job.reservation !== null) await refundUsage(job.reservation).catch((e) => console.error("refundUsage failed:", e));
    await markUnclassified(item.id, item.user_id, gate === undefined ? "failed" : null).catch((e) => console.error("markUnclassified failed:", e));
    return;
  }
  for (let attempt = 0; ; attempt++) {
    try {
      // Past today's service-wide ceiling, also after waiting for the slot or
      // a retry: saved, not sent. 'AI로 정리' picks it up.
      const category = await withSlot(async () => {
        await dailyAiBudget.assertOpen();
        return classifyAndComplete(item, job.imageBase64, job.useEditsAsHint, ent.lang);
      }, job.background);
      await job.onDone?.(category).catch((err) => console.error("classification onDone failed:", err));
      return;
    } catch (err) {
      // Out of credit / key rejected: retrying can't help, park it now.
      if (attempt < RETRY_DELAYS_MS.length && !isAiUnavailable(err)) {
        console.warn(`classification attempt ${attempt + 1} failed for item ${item.id}, retrying:`, err);
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      console.error(`classification failed for item ${item.id} after ${attempt + 1} attempts:`, err);
      if (job.reservation !== null) {
        await refundUsage(job.reservation).catch((e) => console.error("refundUsage failed:", e));
      }
      await markUnclassified(item.id, item.user_id).catch((e) => console.error("markUnclassified failed:", e));
      return;
    }
  }
}

// Queued jobs live in memory, so a server restart would strand their items
// at 'pending' ("분석 중") forever. Called once at startup: re-queues
// whatever is still pending. Their quota was already reserved when they were
// saved, so no new reservation (and no refund to give back if they fail).
export async function resumePendingClassifications(): Promise<number> {
  const items = await listPendingItems(500);
  for (const item of items) enqueueClassification({ item, reservation: null, background: true });
  return items.length;
}
