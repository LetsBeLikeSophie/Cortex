import { z } from "zod";
import sharp from "sharp";
import { fetchLinkMetadata } from "./metadata.js";
import { classifyText, classifyImage } from "./anthropic.js";
import {
  completeClassification,
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
// branch now returns as soon as the row exists (no classification, and for
// links no metadata fetch either -- both are slow network/LLM calls), and
// keeps classifying in the background after that -- see runInBackground.
export async function processIncomingItem(input: IncomingItem, userId: string): Promise<ItemRecord> {
  if (input.captureType === "link") {
    const item = await insertItem({
      userId,
      source: input.source,
      captureType: "link",
      rawUrl: input.url,
      userNote: input.note,
      category: PENDING_CATEGORY,
      tags: [],
      classificationStatus: "pending",
    });
    runInBackground(item.id, userId, async () => {
      const meta = await fetchLinkMetadata(input.url);
      const classification = await classifyText({
        source: input.source,
        url: input.url,
        title: meta.title,
        description: meta.description,
      });
      // og:image/oEmbed's thumbnail -- fetched here alongside the
      // classification since both depend on the same metadata call.
      await completeClassification(item.id, userId, classification, meta.imageUrl);
      await logAnalyticsEvent({ eventType: "item_saved", userId, category: classification.category, source: input.source });
    });
    return item;
  }

  if (input.captureType === "text") {
    const item = await insertItem({
      userId,
      source: input.source,
      captureType: "text",
      rawText: input.text,
      userNote: input.note,
      category: PENDING_CATEGORY,
      tags: [],
      classificationStatus: "pending",
    });
    runInBackground(item.id, userId, async () => {
      const classification = await classifyText({ source: input.source, rawText: input.text });
      await completeClassification(item.id, userId, classification);
      await logAnalyticsEvent({ eventType: "item_saved", userId, category: classification.category, source: input.source });
    });
    return item;
  }

  // The Storage upload stays synchronous -- it's a plain file write (fast),
  // and image_path has to exist for the placeholder row to show a
  // thumbnail at all. Only the Claude vision call (the slow part) moves to
  // the background.
  const compressed = await compressScreenshot(Buffer.from(input.imageBase64, "base64"));
  const imagePath = await uploadScreenshot(userId, compressed, "image/jpeg");
  const item = await insertItem({
    userId,
    source: input.source,
    captureType: "screenshot",
    imagePath,
    userNote: input.note,
    category: PENDING_CATEGORY,
    tags: [],
    classificationStatus: "pending",
  });
  runInBackground(item.id, userId, async () => {
    const classification = await classifyImage({
      source: input.source,
      imageBase64: compressed.toString("base64"),
      mediaType: "image/jpeg",
    });
    await completeClassification(item.id, userId, classification);
    await logAnalyticsEvent({ eventType: "item_saved", userId, category: classification.category, source: input.source });
  });
  return item;
}

// Fire-and-forget, but never an unhandled rejection: the route has already
// responded by the time this runs, so any error here can only be reported
// by flipping the row to 'failed' (and logging) -- there's no request left
// to send it back on.
function runInBackground(itemId: string, userId: string, task: () => Promise<void>): void {
  task().catch(async (err) => {
    console.error(`classification failed for item ${itemId}:`, err);
    try {
      await failClassification(itemId, userId);
    } catch (updateErr) {
      console.error(`failClassification itself failed for item ${itemId}:`, updateErr);
    }
  });
}
