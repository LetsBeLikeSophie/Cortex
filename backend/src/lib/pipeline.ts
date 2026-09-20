import { z } from "zod";
import sharp from "sharp";
import { fetchLinkMetadata } from "./metadata.js";
import { classifyText, classifyImage } from "./anthropic.js";
import { insertItem, uploadScreenshot, ItemRecord, ItemSource } from "./supabase.js";

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

// Tags the user typed in at save time (SaveSheetScreen's space-separated
// tag field) -- distinct from the AI-assigned `tags` classifyText/
// classifyImage produce below, same user_tags column ItemDetailScreen's
// add/remove tag controls read and write later.
const userTagsField = z.array(z.string().min(1)).optional();

export const IncomingItemSchema = z.discriminatedUnion("captureType", [
  z.object({
    captureType: z.literal("link"),
    source: z.enum(SOURCES),
    url: z.string().url(),
    userTags: userTagsField,
  }),
  z.object({
    captureType: z.literal("text"),
    source: z.enum(SOURCES),
    text: z.string().min(1),
    userTags: userTagsField,
  }),
  z.object({
    captureType: z.literal("screenshot"),
    source: z.enum(SOURCES),
    imageBase64: z.string().min(1),
    mediaType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
    userTags: userTagsField,
  }),
]);

export type IncomingItem = z.infer<typeof IncomingItemSchema>;

// De-dupes and drops anything that already matches an AI-assigned tag --
// same rule ItemDetailScreen's add-tag control applies, so a user-typed tag
// at save time can't produce a visually redundant chip either.
function resolveUserTags(userTags: string[] | undefined, aiTags: string[]): string[] {
  if (!userTags?.length) return [];
  const seen = new Set<string>();
  for (const tag of userTags) {
    if (aiTags.includes(tag)) continue;
    seen.add(tag);
  }
  return [...seen];
}

// The three-branch pipeline discussed in the product conversation:
// link -> og:tags/oEmbed, text -> shared straight through, screenshot ->
// Claude vision -- all three converge on the same classifyText/classifyImage
// call so every item ends up with a title/snippet/category/tags.
export async function processIncomingItem(input: IncomingItem, userId: string): Promise<ItemRecord> {
  if (input.captureType === "link") {
    const meta = await fetchLinkMetadata(input.url);
    const classification = await classifyText({
      source: input.source,
      url: input.url,
      title: meta.title,
      description: meta.description,
    });
    return insertItem({
      userId,
      source: input.source,
      captureType: "link",
      rawUrl: input.url,
      // og:image/oEmbed's thumbnail -- fetched above but previously never
      // made it past `meta` into the stored item at all.
      thumbnailUrl: meta.imageUrl,
      ...classification,
      userTags: resolveUserTags(input.userTags, classification.tags),
    });
  }

  if (input.captureType === "text") {
    const classification = await classifyText({ source: input.source, rawText: input.text });
    return insertItem({
      userId,
      source: input.source,
      captureType: "text",
      rawText: input.text,
      ...classification,
      userTags: resolveUserTags(input.userTags, classification.tags),
    });
  }

  const compressed = await compressScreenshot(Buffer.from(input.imageBase64, "base64"));
  const imagePath = await uploadScreenshot(userId, compressed, "image/jpeg");
  const classification = await classifyImage({
    source: input.source,
    imageBase64: compressed.toString("base64"),
    mediaType: "image/jpeg",
  });
  return insertItem({
    userId,
    source: input.source,
    captureType: "screenshot",
    imagePath,
    ...classification,
    userTags: resolveUserTags(input.userTags, classification.tags),
  });
}
