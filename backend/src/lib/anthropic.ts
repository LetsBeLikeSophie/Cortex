import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CATEGORIES } from "./categories.js";

// Reads ANTHROPIC_API_KEY from the environment -- never hardcode a key.
const client = new Anthropic();

// Runs on every single save (text or vision), so cost scales directly with
// usage -- Opus was overkill for a bounded structured-output task this
// small (title/snippet/category/≤5 tags via a Zod schema, no open-ended
// reasoning), so this defaults to Haiku instead. Override via CLASSIFY_MODEL
// if quality ever demands stepping back up for a specific deployment.
const MODEL = process.env.CLASSIFY_MODEL ?? "claude-haiku-4-5-20251001";

const ClassificationSchema = z.object({
  title: z.string().max(120).describe("Short list-item title, in Korean, plain wording"),
  snippet: z.string().max(200).describe("One-line summary of what this is, in Korean"),
  category: z.enum(CATEGORIES),
  tags: z.array(z.string().max(20)).max(5).describe("Freeform short keyword tags, in Korean"),
});

export type Classification = z.infer<typeof ClassificationSchema>;

const SYSTEM_PROMPT = `You catalog items for "Cortex", a personal archive app people
share things into from Instagram/KakaoTalk/a browser/YouTube so they can find
them again later by searching.

For each item, produce:
- title: a short, plain title for a list row (Korean, no hashtags, no quotes)
- snippet: one short line describing what it actually is/says (Korean)
- category: exactly one of the fixed categories provided -- pick "기타" only
  when nothing else genuinely fits
- tags: up to 5 short freeform Korean keyword tags (place names, topics,
  dish names, etc.) -- these are separate from category and can be specific

Never invent facts not present in the given content. If the content is too
thin to summarize confidently, keep title/snippet minimal and honest rather
than guessing.`;

export interface ClassifyTextInput {
  source: string;
  url?: string;
  title?: string;
  description?: string;
  rawText?: string;
}

export async function classifyText(input: ClassifyTextInput): Promise<Classification> {
  const lines = [
    `Source app: ${input.source}`,
    input.url ? `URL: ${input.url}` : null,
    input.title ? `Page title: ${input.title}` : null,
    input.description ? `Page description: ${input.description}` : null,
    input.rawText ? `Shared text:\n${input.rawText}` : null,
  ].filter(Boolean);

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: lines.join("\n") }],
    output_config: { format: zodOutputFormat(ClassificationSchema) },
  });

  return requireParsed(response);
}

export interface ClassifyImageInput {
  source: string;
  imageBase64: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
}

export async function classifyImage(input: ClassifyImageInput): Promise<Classification> {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: input.mediaType, data: input.imageBase64 },
          },
          {
            type: "text",
            text: `Source app: ${input.source}. This is a screenshot the user captured themselves. Read any caption/body text visible in the image and catalog it.`,
          },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(ClassificationSchema) },
  });

  return requireParsed(response);
}

function requireParsed(response: { parsed_output: Classification | null }): Classification {
  if (!response.parsed_output) {
    throw new Error("Claude response did not parse against the classification schema");
  }
  return response.parsed_output;
}
