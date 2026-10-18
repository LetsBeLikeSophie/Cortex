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
  title: z.string().describe("Short list-item title (under ~60 characters), in Korean, plain wording"),
  snippet: z.string().describe("One-line summary of what this is (under ~120 characters), in Korean"),
  category: z.enum(CATEGORIES),
  tags: z
    .array(z.string())
    .describe("4-8 short keyword tags someone would later type to find this, in Korean (keep proper nouns as written)"),
  keyText: z
    .string()
    .describe("Screenshots only: the key words actually visible in the image (names, places, prices, dates, product/menu names); empty string otherwise"),
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
- tags: 4-8 short tags chosen for how the person will SEARCH for this later,
  months from now, half-remembering it. Mix three kinds:
  - the specific names in it: place/store, brand, product, person, group,
    dish, app -- as written, plus the other common spelling when there is
    one (Korean/English, e.g. 블루보틀 + Blue Bottle)
  - the broader word they'd reach for when the name escapes them
    (a café's name -> 카페; a sneaker model -> 운동화)
  - where it is / what it's for when stated (성수, 제주, 선물, 다이어트)
  No filler tags (정보, 추천, 꿀팁) unless that is genuinely the subject.
  Korean spellings are Hangul only -- never mix in Japanese kana or Hanja.
- keyText: for screenshots only, the important words visible in the image,
  copied as they appear (names, addresses, prices, dates, menu or product
  names) -- this is what lets someone find the screenshot by a word that was
  in it. Not a description; empty string for anything that isn't an image.

Title and snippet should carry the findable specifics too (the place or
product name, the area, the price or date if given) rather than generic
wording like "맛집 정보" or "좋은 글". In title and snippet, write names
exactly as the source does (Rick Astley stays Rick Astley) -- the Hangul
spelling of a foreign name belongs in tags only.

Never invent facts not present in the given content. If the content is too
thin to summarize confidently, keep title/snippet minimal and honest rather
than guessing.`;

export interface ClassifyTextInput {
  source: string;
  url?: string;
  title?: string;
  description?: string;
  rawText?: string;
  // Link extras (YouTube Data API): the creator's own tags, the channel,
  // the length, and a thumbnail URL to look at alongside the text.
  creatorTags?: string[];
  siteName?: string;
  durationSec?: number;
  imageUrl?: string;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  return m > 0 ? `${m}분 ${sec % 60}초` : `${sec}초`;
}

export async function classifyText(input: ClassifyTextInput): Promise<Classification> {
  const lines = [
    `Source app: ${input.source}`,
    input.url ? `URL: ${input.url}` : null,
    input.siteName ? `Site/channel: ${input.siteName}` : null,
    input.title ? `Page title: ${input.title}` : null,
    input.durationSec !== undefined ? `Video length: ${formatDuration(input.durationSec)}` : null,
    input.creatorTags?.length ? `Creator's own tags: ${input.creatorTags.join(", ")}` : null,
    input.description ? `Page/video description:\n${input.description}` : null,
    input.rawText ? `Shared text:\n${input.rawText}` : null,
    input.imageUrl
      ? "The attached image is the link's thumbnail -- read any words on it (video thumbnails usually carry the key words), but it's a preview, not the content itself."
      : null,
  ].filter(Boolean);
  const text = lines.join("\n");

  const run = (withImage: boolean) =>
    client.messages.parse({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: withImage
            ? [
                { type: "image", source: { type: "url", url: input.imageUrl! } },
                { type: "text", text },
              ]
            : text,
        },
      ],
      output_config: { effort: "low", format: zodOutputFormat(ClassificationSchema) },
    });

  if (!input.imageUrl) return requireParsed(await run(false));
  try {
    return requireParsed(await run(true));
  } catch (err) {
    // A thumbnail that can't be fetched (removed, region-blocked) shouldn't
    // lose the whole classification -- the text alone still works.
    console.error("classifyText with thumbnail failed, retrying text-only:", err);
    return requireParsed(await run(false));
  }
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

// Length limits live here, not in the Zod schemas: structured outputs
// don't enforce string/array length, so a schema .max() only got checked
// client-side -- and one tag a few characters too long (a song title as a
// tag, say) failed the whole classification. Clip instead.
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n).trimEnd() : s);

// Japanese kana spliced into a Hangul word ("리ック") -- a Haiku quirk when
// it transliterates a foreign name. Such a tag is never what anyone types.
const MIXED_KANA = /[가-힣].*[぀-ヿ]|[぀-ヿ].*[가-힣]/;

// Same quirk in prose: drop just the garbled word, keep the sentence.
function dropMixedKana(text: string): string {
  return text
    .split(/(\s+)/)
    .filter((w) => !MIXED_KANA.test(w))
    .join("")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function clipTags(tags: string[], maxCount: number, maxLen: number): string[] {
  const out: string[] = [];
  for (const raw of tags) {
    const t = clip(raw.trim().replace(/^#/, ""), maxLen);
    if (t && !MIXED_KANA.test(t) && !out.includes(t)) out.push(t);
    if (out.length === maxCount) break;
  }
  return out;
}

function requireParsed(response: { parsed_output: Classification | null }): Classification {
  const c = response.parsed_output;
  if (!c) {
    throw new Error("Claude response did not parse against the classification schema");
  }
  return {
    ...c,
    title: clip(dropMixedKana(c.title), 120),
    snippet: clip(dropMixedKana(c.snippet), 200),
    tags: clipTags(c.tags, 8, 30),
    keyText: clip(c.keyText ?? "", 400),
  };
}

const TagFromTextSchema = z.object({
  tag: z.string().describe("A single short freeform keyword tag, in Korean"),
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
  return clip(response.parsed_output.tag.trim(), 30);
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
        term: z.string().describe("The core keyword, in Korean, as the user would expect it to appear"),
        synonyms: z
          .array(z.string())
          .describe("Close alternatives the same saved item might use instead (Korean/English spellings, near-synonyms)"),
      })
    )
    .describe("Up to 5 keyword groups"),
  exclude: z.array(z.string()).describe("Only words the user explicitly ruled out (~말고, ~빼고, ~아닌)"),
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
  return clipInterpretation(response.parsed_output);
}

// Same idea as clipTags: bound sizes after parsing. Also applied to an
// edited interpretation the app sends back to /items/search/smart.
export function clipInterpretation(q: SearchInterpretation): SearchInterpretation {
  return {
    ...q,
    keywords: q.keywords
      .slice(0, 5)
      .map((k) => ({ term: clip(k.term.trim(), 30), synonyms: clipTags(k.synonyms, 4, 30) }))
      .filter((k) => k.term),
    exclude: clipTags(q.exclude, 3, 30),
  };
}
