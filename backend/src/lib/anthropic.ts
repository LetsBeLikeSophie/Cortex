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
// Claude Haiku 5.5 at effort "low": measured on a real phone screenshot it
// was faster than Haiku 4.5 (~1.9s vs ~2.9s), read Korean text correctly
// where 4.5 garbled it, and costs ~1/10 per token. It thinks by default --
// "low" keeps that short, and max_tokens leaves room for it.
const MODEL = process.env.CLASSIFY_MODEL ?? "claude-haiku-5-5";

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
- category: exactly one of the fixed categories provided. These are
  intent-based ("why would someone save this"), not topic-based -- pick by
  what the person would likely use it for later, regardless of subject
  matter:
  - 가볼 곳: a place (restaurant, venue, destination, store)
  - 살 것: a product or something to purchase
  - 배울 것: a how-to, recipe, tutorial, or skill/technique
  - 볼 것: an article, video, or post to read/watch later
  - 기억할 것: a fact, decision, schedule, or note-to-self worth keeping
  - 기타: only when nothing above genuinely fits
- tags: up to 5 short freeform Korean keyword tags (the actual subject --
  place names, a fandom/group name, topics, dish names, etc.) -- this is
  where specificity goes, separate from the category above

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
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: lines.join("\n") }],
    output_config: { effort: "low", format: zodOutputFormat(ClassificationSchema) },
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
    max_tokens: 2048,
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
    output_config: { effort: "low", format: zodOutputFormat(ClassificationSchema) },
  });

  return requireParsed(response);
}

function requireParsed(response: { parsed_output: Classification | null }): Classification {
  if (!response.parsed_output) {
    throw new Error("Claude response did not parse against the classification schema");
  }
  return response.parsed_output;
}

const TagFromTextSchema = z.object({
  tag: z.string().max(20).describe("A single short freeform keyword tag, in Korean"),
});

const TAG_SYSTEM_PROMPT = `You turn one spoken sentence into a single short keyword
tag for a personal archive app. The input is a speech-to-text transcript, so it may
run on, include filler words, or be a full sentence explaining what something is --
extract just the core keyword/phrase someone would want as a tag (a place, subject,
product, person, or category), stripped of filler ("이건", "그거 있잖아", "~인 것 같아")
and verb endings. Keep it short (2-10 characters is typical). If the transcript is
already basically just a bare word or phrase, return it close to as-is.`;

// Used for voice-to-tag: the raw transcript almost never reads as a clean tag
// on its own (it's spoken, not typed), so this is a second, much smaller
// classification call purely to clean that up -- same model tier as
// classifyText/classifyImage since it's just as bounded a task.
export async function tagFromText(spokenText: string): Promise<string> {
  const response = await client.messages.parse({
    model: MODEL,
    // Room for Haiku 5.5's (short, at "low") thinking before the tag itself.
    max_tokens: 1024,
    system: TAG_SYSTEM_PROMPT,
    messages: [{ role: "user", content: spokenText }],
    output_config: { effort: "low", format: zodOutputFormat(TagFromTextSchema) },
  });
  if (!response.parsed_output) {
    throw new Error("Claude response did not parse against the tag schema");
  }
  return response.parsed_output.tag;
}

// Natural-language search: turns a half-remembered sentence ("지난달
// 인스타에서 본 제주 카페 같은 거") into the structured query
// searchItemsSmart runs. Filters (date/source/captureType/category) are the
// parts people tend to remember accurately, so they narrow hard; keywords
// are the fuzzy part, so each one carries synonyms and only affects ranking
// (see searchItemsSmart in supabase.ts). Every field stays editable on the
// client as a chip, so a misread here is one tap to undo -- which is why
// the prompt leans toward leaving a filter null over guessing one.
export const SearchInterpretationSchema = z.object({
  keywords: z
    .array(
      z.object({
        term: z.string().max(20).describe("The core keyword, in Korean, as the user would expect it to appear"),
        synonyms: z
          .array(z.string().max(20))
          .max(4)
          .describe("Close alternatives the same saved item might use instead (Korean/English spellings, near-synonyms)"),
      })
    )
    .max(5),
  exclude: z.array(z.string().max(20)).max(3).describe("Only words the user explicitly ruled out (~말고, ~빼고, ~아닌)"),
  source: z.enum(["instagram", "kakaotalk", "safari", "youtube", "memo", "other"]).nullable(),
  captureType: z.enum(["link", "text", "screenshot"]).nullable(),
  category: z.enum(CATEGORIES).nullable(),
  dateFrom: z.string().nullable().describe("Inclusive start date, YYYY-MM-DD, Korea time"),
  dateTo: z.string().nullable().describe("Inclusive end date, YYYY-MM-DD, Korea time"),
});

export type SearchInterpretation = z.infer<typeof SearchInterpretationSchema>;

const SEARCH_SYSTEM_PROMPT = `You turn a search sentence into a structured query for "Cortex",
a personal archive app. People save things from Instagram/KakaoTalk/a browser/YouTube
and later search for them -- usually with a vague, half-remembered description, not
exact words. Your job is to extract what they actually remember.

Fields:
- keywords: the subject words to look for (place, food, product, topic, person...).
  One entry per separate concept -- "제주 카페" is two keywords (제주, 카페), never
  one combined term, since a saved item rarely contains the exact phrase. For each,
  add up to 4 synonyms the saved item might use instead (e.g. 카페 -> 커피, 디저트;
  숙소 -> 호텔, 펜션, 에어비앤비). Drop filler (그거, 뭐더라, 저장한, 봤던, 같은 거) --
  it is not a keyword. Words that map onto a filter below (인스타, 지난달, 사진...) are
  NOT keywords either. Empty list is fine if nothing but filters was said.
- exclude: only things explicitly ruled out ("카페 말고" -> 카페). Usually empty.
- source: where it was saved FROM -- instagram (인스타), kakaotalk (카톡), safari
  (사파리/인터넷/웹/브라우저), youtube (유튜브), memo (직접 쓴 메모). null unless stated.
- captureType: screenshot (캡처/스크린샷/사진), link (링크), text (글/텍스트). null unless stated.
- category: one of 가볼 곳 (a place to go), 살 것 (to buy), 배울 것 (how-to/recipe),
  볼 것 (to read/watch), 기억할 것 (fact/note to keep), 기타. Only set it when the
  sentence clearly implies the intent ("가보려고", "사려고"); otherwise null --
  a wrong category hides the item entirely.
- dateFrom/dateTo: when it was saved, resolved against today's date given below.
  "지난달" = the whole previous calendar month, "최근/요즘" = last 14 days,
  "작년" = previous calendar year, "어제" = yesterday only. Be generous with vague
  ranges -- people misremember timing. null if no time was mentioned.`;

// Search runs far more often than saves and is a small, bounded parse, so
// it gets the cheapest current model on its own setting (separate from
// CLASSIFY_MODEL): Claude Haiku 5.5 is ~10x cheaper per token than Haiku
// 4.5. It thinks by default -- effort "low" keeps that minimal (latency +
// output tokens), and max_tokens leaves room for any thinking it does do.
const SEARCH_MODEL = process.env.SEARCH_MODEL ?? "claude-haiku-5-5";

export async function interpretSearch(query: string, today: string): Promise<SearchInterpretation> {
  const response = await client.messages.parse({
    model: SEARCH_MODEL,
    max_tokens: 2048,
    system: SEARCH_SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Today (Korea time): ${today}\nSearch: ${query}` }],
    output_config: { effort: "low", format: zodOutputFormat(SearchInterpretationSchema) },
  });
  if (!response.parsed_output) {
    throw new Error("Claude response did not parse against the search schema");
  }
  return response.parsed_output;
}
