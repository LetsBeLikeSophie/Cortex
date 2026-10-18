import { z } from "zod";
import sharp from "sharp";
import { fetchLinkMetadata } from "./metadata.js";
import { classifyText, classifyImage } from "./anthropic.js";
import { getEntitlement, recordUsage, remaining } from "./plans.js";
import {
  ClassificationStatus,
  completeClassification,
  downloadScreenshot,
  listUnclassifiedItems,
  markClassificationPending,
  failClassification,
  insertItem,
  logAnalyticsEvent,
  uploadScreenshot,
  ItemRecord,
  ItemSource,
} from "./supabase.js";

// Bounds both Storage growth and Claude vision cost, which scale with image
// size -- downscale-only (a small screenshot stays as-is) and re-encoded as
// JPEG so both the stored copy and the classification call use the smaller
// version, regardless of the original format.
const SCREENSHOT_MAX_WIDTH = 1600;
const SCREENSHOT_JPEG_QUALITY = 82;

async function compressScreenshot(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes)
    .resize({ width: SCREENSHOT_MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: SCREENSHOT_JPEG_QUALITY })
    .toBuffer();
}

const SOURCES = ["instagram", "kakaotalk", "safari", "youtube", "memo", "other"] as const satisfies readonly ItemSource[];

export const IncomingItemSchema = z.discriminatedUnion("captureType", [
  z.object({
    captureType: z.literal("link"),
    source: z.enum(SOURCES),
    url: z.string().url(),
    note: z.string().max(200).optional(),
  }),
  z.object({
    captureType: z.literal("text"),
    source: z.enum(SOURCES),
    text: z.string().min(1),
    note: z.string().max(200).optional(),
  }),
  z.object({
    captureType: z.literal("screenshot"),
    source: z.enum(SOURCES),
    imageBase64: z.string().min(1),
    mediaType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
    note: z.string().max(200).optional(),
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
// (see runInBackground) -- unless the month's AI classification quota is
// used up: then the item still saves, as 'unclassified', with no Claude call
// at all, and waits in the app's 미분류함 (see classifyBacklog).
export async function processIncomingItem(input: IncomingItem, userId: string): Promise<ItemRecord> {
  // Fails open: if the quota lookup itself breaks (e.g. the plan tables
  // aren't migrated yet), saving must still work -- it classifies as before.
  const classifyNow = await getEntitlement(userId)
    .then((ent) => remaining(ent, "classify") > 0)
    .catch((err) => {
      console.error("quota lookup failed, classifying anyway:", err);
      return true;
    });
  const status: ClassificationStatus = classifyNow ? "pending" : "unclassified";
  const base = { userId, source: input.source, userNote: input.note, category: PENDING_CATEGORY, tags: [], classificationStatus: status };

  let item: ItemRecord;
  let imageBase64: string | undefined;
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

  if (classifyNow) {
    runInBackground(item.id, userId, async () => {
      const category = await classifyAndComplete(item, imageBase64);
      await logAnalyticsEvent({ eventType: "item_saved", userId, category, source: input.source });
    });
  } else {
    await logAnalyticsEvent({ eventType: "item_saved", userId, source: input.source });
  }
  return item;
}

// Runs the classification for one stored row and records the quota use.
// Works for a fresh save (imageBase64 already in hand) and for a deferred
// 미분류함 item (re-reads link metadata / the stored screenshot).
async function classifyAndComplete(item: ItemRecord, imageBase64?: string) {
  let classification;
  let thumbnailUrl: string | undefined;
  if (item.capture_type === "link" && item.raw_url) {
    const meta = await fetchLinkMetadata(item.raw_url);
    classification = { ...(await classifyText({ source: item.source, url: item.raw_url, title: meta.title, description: meta.description })), keyText: undefined };
    // og:image/oEmbed's thumbnail -- fetched alongside the classification
    // since both depend on the same metadata call.
    thumbnailUrl = meta.imageUrl;
  } else if (item.capture_type === "screenshot" && item.image_path) {
    const b64 = imageBase64 ?? (await downloadScreenshot(item.image_path)).toString("base64");
    classification = await classifyImage({ source: item.source, imageBase64: b64, mediaType: "image/jpeg" });
  } else {
    // keyText is a screenshot-only field -- dropped here so a text memo's
    // own raw_text can never be overwritten by it.
    classification = { ...(await classifyText({ source: item.source, rawText: item.raw_text ?? "" })), keyText: undefined };
  }
  await completeClassification(item.id, item.user_id, classification, thumbnailUrl);
  // The item is classified at this point -- a failed usage write must not
  // flip it to 'failed' (runSafely would), so it's only logged.
  await recordUsage(item.user_id, "classify").catch((err) => console.error("recordUsage(classify) failed:", err));
  return classification.category;
}

// "AI로 정리": classifies as much of the 미분류함 backlog as this month's
// quota allows, oldest first. Rows flip to 'pending' up front (so the app
// shows them as 분석 중 right away); the Claude calls then run one after
// another in the background rather than all at once.
export async function classifyBacklog(userId: string): Promise<{ started: number; left: number }> {
  const ent = await getEntitlement(userId);
  const budget = remaining(ent, "classify");
  if (budget === 0) return { started: 0, left: ent.unclassifiedCount };
  const items = await listUnclassifiedItems(userId, budget);
  for (const item of items) await markClassificationPending(item.id, userId);
  void (async () => {
    for (const item of items) {
      await runSafely(item.id, userId, () => classifyAndComplete(item).then(() => undefined));
    }
  })();
  return { started: items.length, left: ent.unclassifiedCount - items.length };
}

// Fire-and-forget, but never an unhandled rejection: the route has already
// responded by the time this runs, so any error here can only be reported
// by flipping the row to 'failed' (and logging) -- there's no request left
// to send it back on.
function runInBackground(itemId: string, userId: string, task: () => Promise<void>): void {
  void runSafely(itemId, userId, task);
}

async function runSafely(itemId: string, userId: string, task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch (err) {
    console.error(`classification failed for item ${itemId}:`, err);
    try {
      await failClassification(itemId, userId);
    } catch (updateErr) {
      console.error(`failClassification itself failed for item ${itemId}:`, updateErr);
    }
  }
}
