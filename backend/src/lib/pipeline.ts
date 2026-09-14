import { z } from "zod";
import { fetchLinkMetadata } from "./metadata.js";
import { classifyText, classifyImage } from "./anthropic.js";
import { insertItem, uploadScreenshot, ItemRecord, ItemSource } from "./supabase.js";
import { DEV_USER_ID } from "./devUser.js";

const SOURCES = ["instagram", "kakaotalk", "safari", "youtube", "memo", "other"] as const satisfies readonly ItemSource[];

export const IncomingItemSchema = z.discriminatedUnion("captureType", [
  z.object({
    captureType: z.literal("link"),
    source: z.enum(SOURCES),
    url: z.string().url(),
  }),
  z.object({
    captureType: z.literal("text"),
    source: z.enum(SOURCES),
    text: z.string().min(1),
  }),
  z.object({
    captureType: z.literal("screenshot"),
    source: z.enum(SOURCES),
    imageBase64: z.string().min(1),
    mediaType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  }),
]);

export type IncomingItem = z.infer<typeof IncomingItemSchema>;

// The three-branch pipeline discussed in the product conversation:
// link -> og:tags/oEmbed, text -> shared straight through, screenshot ->
// Claude vision -- all three converge on the same classifyText/classifyImage
// call so every item ends up with a title/snippet/category/tags.
export async function processIncomingItem(input: IncomingItem, userId = DEV_USER_ID): Promise<ItemRecord> {
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
      ...classification,
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
    });
  }

  const imagePath = await uploadScreenshot(userId, Buffer.from(input.imageBase64, "base64"), input.mediaType);
  const classification = await classifyImage({
    source: input.source,
    imageBase64: input.imageBase64,
    mediaType: input.mediaType,
  });
  return insertItem({
    userId,
    source: input.source,
    captureType: "screenshot",
    imagePath,
    ...classification,
  });
}
