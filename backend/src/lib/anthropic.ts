import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CATEGORIES } from "./categories.js";
import { AiPurpose, logAiCall } from "./aiLog.js";

// Keys come from the environment only -- never hardcode a key.
// One client per feature, each with its own API key when set
// (ANTHROPIC_API_KEY_CLASSIFY / _SEARCH / _VOICE), so the Anthropic console
// can split usage and cost by feature. Unset -> falls back to the shared
// ANTHROPIC_API_KEY, which keeps everything working before the keys exist.
const clientFor = (envName: string) => new Anthropic({ apiKey: process.env[envName] || process.env.ANTHROPIC_API_KEY });
const classifyClient = clientFor("ANTHROPIC_API_KEY_CLASSIFY");
const searchClient = clientFor("ANTHROPIC_API_KEY_SEARCH");
const voiceClient = clientFor("ANTHROPIC_API_KEY_VOICE");

// The Claude API itself is unusable for reasons retrying won't fix: the
// account's prepaid credit ran out, or the key is rejected. Distinct from a
// transient failure (overload, timeout), which is worth retrying.
export function isAiUnavailable(err: unknown): boolean {
  if (!(err instanceof Anthropic.APIError)) return false;
  if (err.status === 401 || err.status === 403) return true;
  return err.status === 400 && /credit balance/i.test(err.message);
}

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

// The language the person uses the app in (their device language, sent by
// the app): every title, memo, tag and composed memo is written in it.
// Korean keeps its tuned house style; other languages get the same rules
// in their own natural note-taking style.
export const DEFAULT_LANG = "ko";

export function normalizeLang(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const tag = raw.trim().replace(/_/g, "-");
  if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/.test(tag)) return null;
  try {
    return Intl.getCanonicalLocales(tag)[0] ?? null;
  } catch {
    return null;
  }
}

export function languageName(lang: string): string {
  try {
    const name = new Intl.DisplayNames(["en"], { type: "language" }).of(lang);
    return name && name !== lang ? name : "Korean";
  } catch {
    return "Korean";
  }
}

const isKorean = (lang: string) => lang === "ko" || lang.startsWith("ko-");

const ClassificationSchema = z.object({
  title: z.string().describe("Short list-item title (under ~60 characters), in the person's language, plain wording"),
  snippet: z.string().describe("A 1-2 sentence searchable note-to-self (under ~160 characters), in the person's language"),
  category: z.enum(CATEGORIES),
  tags: z
    .array(z.string())
    .describe("4-8 short keyword tags someone would later type to find this, in the person's language (keep proper nouns as written)"),
  keyText: z
    .string()
    .describe("Screenshots only: the key words actually visible in the image (names, places, prices, dates, product/menu names); empty string otherwise"),
  hasText: z
    .boolean()
    .describe("Screenshots only: true if the image shows readable text (captions, signs, menus, app UI, chat); false if not, and false for anything that isn't an image"),
});

export type Classification = z.infer<typeof ClassificationSchema>;

function classifySystem(lang: string): string {
  const L = languageName(lang);
  const ko = isKorean(lang);
  return `You catalog items for "Cortex", a personal archive app people
share things into from Instagram/KakaoTalk/a browser/YouTube so they can find
them again later by searching.

Language: the title, snippet and tags are ALWAYS written in ${L}, whatever
language the content is in -- a video, menu or article in any other language
gets a ${L} title and memo (translate the meaning). The person reads and
searches this app in ${L}. Only proper nouns (names, brands, product or song
titles) may stay as written in the source.

For each item, produce:
- title: a short, plain title for a list row (${L}, no hashtags, no quotes)
- snippet: a 1-2 sentence note-to-self in ${L}, written so the person can
  find this again by searching months later: what it is, plus every concrete
  detail actually present -- names (place, store, product, person, channel),
  area or address, price, date/time/deadline, quantities, and who or what
  it's for. Prefer those specifics over adjectives ("완전 맛있대" adds
  nothing to search on). Don't repeat the title word for word.
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
    one (the ${L} and the original/English spelling, e.g. 블루보틀 + Blue Bottle)
  - the broader word they'd reach for when the name escapes them
    (a café's name -> 카페; a sneaker model -> 운동화)
  - where it is / what it's for when stated (성수, 제주, 선물, 다이어트)
  No filler tags (정보, 추천, 꿀팁) unless that is genuinely the subject.
  Keep each tag to its core word: "수달", not "수달 캐릭터" / "수달 조형물";
  if the kind matters, add it as its own tag ("캐릭터", "조형물"). When the
  person's existing tags are listed, reuse one exactly as written whenever
  it means the same thing, instead of a variant spelling or a longer form.
  ${ko ? "Korean spellings are Hangul only -- never mix in Japanese kana or Hanja." : "Write each word in one script -- never mix scripts inside a word."}
- keyText: for screenshots only, the important words visible in the image,
  copied as they appear (names, addresses, prices, dates, menu or product
  names) -- this is what lets someone find the screenshot by a word that was
  in it. Not a description; empty string for anything that isn't an image.
- hasText: for screenshots only, true when the image contains readable text
  (captions, signs, menus, app screens, chats), false when it doesn't (a
  landscape, a face, an object). false for anything that isn't an image.

Title and snippet should carry the findable specifics too (the place or
product name, the area, the price or date if given) rather than generic
wording like "맛집 정보" or "좋은 글". In title and snippet, write names
exactly as the source does (Rick Astley stays Rick Astley) -- the ${L}
spelling of a foreign name belongs in tags only.

${ko
  ? `Write title and snippet as a terse memo, always in the same style: end each
sentence with a noun or a noun-form ending (~함, ~음, ~것, or just the noun),
e.g. "성수동 크로플 맛집. 평일 웨이팅 30분, 5월까지 한정 메뉴 있음." Never
해요체 or 합니다체 ("~예요", "~입니다").`
  : `Write title and snippet as a terse memo in the natural note-taking style of
${L}: short fragments, no greetings, no polite filler, the same style every
time. (Examples elsewhere in these instructions are Korean; follow their
content rules, not their language.)`}

Describe what IS there. Never write that something is absent -- no
"글자는 보이지 않음", "텍스트 없음", "설명 없음" or the like in the title,
snippet or tags. Whether an image has text goes in hasText, and the person
never needs to read it.

Never invent facts not present in the given content. If the content is too
thin to summarize confidently, keep title/snippet minimal and honest rather
than guessing.

People in images: never work out who someone is from their face or body,
and never guess or describe sensitive traits (race or ethnicity, religion,
health, sexual orientation, political views). A person's name is used only
when it is written in the image or the given text (a caption, a chat name,
a sign) -- otherwise use a plain word for "person" in ${L}.`;
}

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
  // The person's own words about the item (their note, or a title/memo they
  // edited before asking for a re-organize) -- see hintLine.
  hint?: string;
  // This person's most-used tags, to reuse instead of near-duplicates.
  knownTags?: string[];
  // For the per-call usage log (aiLog.ts).
  userId?: string;
  // The person's app language (see normalizeLang); Korean when unknown.
  lang?: string;
}

function knownTagsLine(tags?: string[]): string | null {
  return tags && tags.length > 0 ? `Tags this person already uses (reuse when the meaning matches): ${tags.join(", ")}` : null;
}

// When the person has written something themselves, it's the best signal of
// what this item is to them -- the classifier should build on it, not
// overrule it with a generic reading of the content.
function hintLine(hint?: string): string | null {
  const h = hint?.trim();
  return h
    ? `The person's own words about this (written or edited by them -- treat as the main guide; keep their names and facts, fill in from the content):\n${h}`
    : null;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  return m > 0 ? `${m} min ${sec % 60} s` : `${sec} s`;
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
    hintLine(input.hint),
    knownTagsLine(input.knownTags),
    input.imageUrl
      ? "The attached image is the link's thumbnail -- read any words on it (video thumbnails usually carry the key words), but it's a preview, not the content itself."
      : null,
  ].filter(Boolean);
  const text = lines.join("\n");

  const purpose: AiPurpose = input.url ? "classify_link" : "classify_text";
  const run = (withImage: boolean) =>
    classifyClient.messages
      .parse({
      model: MODEL,
      max_tokens: 2048,
      system: classifySystem(input.lang ?? DEFAULT_LANG),
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
      })
      .then((response) => {
        logAiCall(purpose, MODEL, response.usage, input.userId);
        return response;
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
  hint?: string;
  knownTags?: string[];
  userId?: string;
  lang?: string;
}

export async function classifyImage(input: ClassifyImageInput): Promise<Classification> {
  const response = await classifyClient.messages.parse({
    model: MODEL,
    max_tokens: 2048,
    system: classifySystem(input.lang ?? DEFAULT_LANG),
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
            text: `Source app: ${input.source}. This is a screenshot the user captured themselves. Read any caption/body text visible in the image and catalog it.${[hintLine(input.hint), knownTagsLine(input.knownTags)].filter(Boolean).map((l) => `\n${l}`).join("")}`,
          },
        ],
      },
    ],
    output_config: { effort: "low", format: zodOutputFormat(ClassificationSchema) },
  });

  logAiCall("classify_image", MODEL, response.usage, input.userId);
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

// Backstop for the prompt rule above: a sentence that only says the image
// has no (readable) text -- "글자는 보이지 않음", "화면에 읽을 수 있는 글자는
// 없습니다", "텍스트 없음" ... -- is dropped from the snippet. That fact lives
// in hasText; it's noise to the person reading the memo.
const ABSENT_TEXT = /(글자|글씨|텍스트|문구|문자)[^.。!?]*?(없|보이지 ?않|확인되지 ?않|읽을 수 ?없)/;

// Works clause by clause (", " splits clauses; "4,500원" has no space so it
// stays whole) so only the "no text" part goes and the rest keeps its
// punctuation.
export function stripAbsentTextNotes(snippet: string): string {
  if (!ABSENT_TEXT.test(snippet)) return snippet;
  // Sentence ends only where punctuation is followed by a space, so "1.0%"
  // and "?'" stay intact.
  const sentences = snippet.split(/(?<=[.。!?])\s+/);
  const kept: string[] = [];
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!ABSENT_TEXT.test(sentence)) {
      if (sentence) kept.push(sentence);
      continue;
    }
    const end = sentence.match(/[.。!?]$/)?.[0] ?? "";
    const body = end ? sentence.slice(0, -1) : sentence;
    const clauses = body.split(/,\s+/).filter((c) => c.trim() && !ABSENT_TEXT.test(c));
    // "...달이 보이는 사진으로, 글자는 없습니다." loses its second clause;
    // drop the connective the first one was left hanging on.
    if (clauses.length > 0) kept.push(clauses.join(", ").trim().replace(/(으로|이며|이고)$/, "") + (end || "."));
  }
  return kept.join(" ");
}

function requireParsed(response: { parsed_output: Classification | null }): Classification {
  const c = response.parsed_output;
  if (!c) {
    throw new Error("Claude response did not parse against the classification schema");
  }
  return {
    ...c,
    title: clip(dropMixedKana(c.title), 120),
    snippet: clip(stripAbsentTextNotes(dropMixedKana(c.snippet)), 250),
    tags: clipTags(c.tags, 8, 30),
    keyText: clip(c.keyText ?? "", 400),
  };
}

const TagFromTextSchema = z.object({
  tag: z.string().describe("A single short freeform keyword tag, in the same language as the transcript"),
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
export async function tagFromText(spokenText: string, userId?: string): Promise<string> {
  const response = await voiceClient.messages.parse({
    model: MODEL,
    // Room for Haiku 5.5's (short, at "low") thinking before the tag itself.
    max_tokens: 1024,
    system: TAG_SYSTEM_PROMPT,
    messages: [{ role: "user", content: spokenText }],
    output_config: { effort: "low", format: zodOutputFormat(TagFromTextSchema) },
  });
  logAiCall("voice_tag", MODEL, response.usage, userId);
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
        term: z.string().describe("The core keyword, in the language of the search sentence, as the user would expect it to appear in their saved items"),
        synonyms: z
          .array(z.string())
          .describe("Close alternatives the same saved item might use instead (local/English spellings, near-synonyms)"),
      })
    )
    .describe("Up to 5 keyword groups"),
  exclude: z.array(z.string()).describe("Only words the user explicitly ruled out (~말고, ~빼고, ~아닌)"),
  source: z.enum(["instagram", "kakaotalk", "safari", "youtube", "memo", "other"]).nullable(),
  captureType: z.enum(["link", "text", "screenshot"]).nullable(),
  category: z.enum(CATEGORIES).nullable(),
  dateFrom: z.string().nullable().describe("Inclusive start date, YYYY-MM-DD, Korea time"),
  dateTo: z.string().nullable().describe("Inclusive end date, YYYY-MM-DD, Korea time"),
  sort: z
    .enum(["oldest", "newest"])
    .nullable()
    .describe("Order asked for by the sentence (가장 오래된/처음 -> oldest, 가장 최근/마지막 -> newest); null when no order is asked for"),
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
  NOT keywords either. Words that only mean "something I saved" (기억, 저장한 거,
  메모, 거, 것) are not keywords either -- "가장 오래된 기억" has no keyword.
  Empty list is fine if nothing but filters was said.
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
  ranges -- people misremember timing. null if no time was mentioned.
- sort: "oldest" when they ask for the earliest/oldest/first saved (가장 오래된,
  처음 저장한, 제일 예전), "newest" for the latest (가장 최근, 마지막으로 저장한).
  null otherwise -- results are then ranked by how well they match.`;

// Search runs far more often than saves and is a small, bounded parse, so
// it gets the cheapest current model on its own setting (separate from
// CLASSIFY_MODEL): Claude Haiku 5.5 is ~10x cheaper per token than Haiku
// 4.5. It thinks by default -- effort "low" keeps that minimal (latency +
// output tokens), and max_tokens leaves room for any thinking it does do.
const SEARCH_MODEL = process.env.SEARCH_MODEL ?? "claude-haiku-5-5";

export async function interpretSearch(query: string, today: string, userId?: string): Promise<SearchInterpretation> {
  const response = await searchClient.messages.parse({
    model: SEARCH_MODEL,
    max_tokens: 2048,
    system: SEARCH_SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Today (Korea time): ${today}\nSearch: ${query}` }],
    output_config: { effort: "low", format: zodOutputFormat(SearchInterpretationSchema) },
  });
  logAiCall("search", SEARCH_MODEL, response.usage, userId);
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

// ---- "모아서 만들기" (compose) --------------------------------------------
// Everything under one tag becomes one new memo: a course, a list, or a
// summary. Works only from what's already saved (titles, AI memos, the
// person's own notes, words read off screenshots) -- images aren't resent,
// so a 50-item compose costs well under 1원.

export type ComposeFormat = "auto" | "course" | "list" | "summary";

export interface ComposeSource {
  title: string | null;
  memo: string | null;
  myMemo: string | null;
  keyText: string | null; // words read off a screenshot
  body: string | null; // a text memo's own body -- the person's writing
  category: string;
  tags: string[];
  url: string | null;
}

const ComposeSchema = z.object({
  title: z.string().describe("Short title for the new memo, in the person's language"),
  body: z.string().describe("The composed memo, in the person's language, plain text with simple line breaks and '-' bullets"),
});

const COMPOSE_FORMATS: Record<Exclude<ComposeFormat, "auto">, string> = {
  course:
    "A course/route plan: group the places by area, suggest a sensible order to visit them, and note per place what to see/eat/buy and anything the person wrote about it. Places that don't fit a route go in a short '기타' list at the end.",
  list:
    "A checklist/comparison: one line per item with the deciding facts that are actually given (price, where, size, what it's for, the person's own note), grouped by kind when that helps.",
  summary:
    "A summary note: first 2-3 lines on what this collection is about overall, then the key points as bullets, merging items that say the same thing.",
};

const COMPOSE_SYSTEM = `You turn a set of saved items from "Cortex" (a personal archive app)
into one useful memo for the person who saved them.

Rules:
- Write everything in the person's language (given with the request). Names and brands may stay as written.
- Use ONLY facts present in the items. Never add opening hours, prices,
  addresses, ratings or anything else that isn't there. If something useful
  is missing, don't fill it in.
- Mention each item by its own name/title so the person recognizes it.
- The person's own notes ("내 메모") and their own writing ("본문") matter most -- keep what they said.
- Terse memo style, no greetings or filler. Plain text: line breaks, "-"
  bullets, "1." numbering. No markdown headings, no emoji.`;

// "AI가 알아서": the model picks the shape that suits the collection --
// the three shapes are all still spelled out, so it costs about the same.
function formatLine(format: ComposeFormat): string {
  if (format !== "auto") return COMPOSE_FORMATS[format];
  return `Pick whichever one of these fits the collection best and use it: (1) ${COMPOSE_FORMATS.course} (2) ${COMPOSE_FORMATS.list} (3) ${COMPOSE_FORMATS.summary}`;
}

const COMPOSE_BODY_MAX = 1500;
const COMPOSE_BODY_TOTAL = 20000;

export async function composeFromItems(
  tag: string,
  format: ComposeFormat,
  items: ComposeSource[],
  userId?: string,
  // The person's own one-line ask ("비교표로, 가격순") -- shapes the memo.
  instruction?: string,
  lang: string = DEFAULT_LANG
): Promise<{ title: string; body: string }> {
  const ask = instruction
    ? `\nThe person asked for: ${instruction}\n(Follow this for the shape and focus; it overrides the format above where they differ. Still use only what the items say.)`
    : "";
  // A text memo's body is the person's own writing (a review, a list) --
  // sent up to COMPOSE_BODY_MAX each, within a total budget spent newest
  // first (items arrive newest first), so the oldest are cut short first.
  let bodyBudget = COMPOSE_BODY_TOTAL;
  const bodies = items.map((it) => {
    if (!it.body) return null;
    const take = Math.min(it.body.length, COMPOSE_BODY_MAX, bodyBudget);
    bodyBudget -= take;
    return take > 0 ? it.body.slice(0, take) : null;
  });
  const lines = items.map((it, i) =>
    [
      `#${i + 1} [${it.category}] ${it.title ?? "(제목 없음)"}`,
      it.memo ? `  AI 메모: ${it.memo}` : null,
      it.myMemo ? `  내 메모: ${it.myMemo}` : null,
      bodies[i] ? `  본문: ${bodies[i]}` : null,
      it.keyText ? `  사진 속 글자: ${it.keyText.slice(0, 300)}` : null,
      it.tags.length ? `  태그: ${it.tags.join(", ")}` : null,
      it.url ? `  링크: ${it.url}` : null,
    ]
      .filter(Boolean)
      .join("\n")
  );
  const response = await classifyClient.messages.parse({
    model: MODEL,
    max_tokens: 4096,
    system: COMPOSE_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Language: ${languageName(lang)}\nTag: ${tag}\nFormat: ${formatLine(format)}${ask}\n\nItems (${items.length}):\n${lines.join("\n\n")}`,
      },
    ],
    output_config: { effort: "medium", format: zodOutputFormat(ComposeSchema) },
  });
  logAiCall("compose", MODEL, response.usage, userId);
  const out = response.parsed_output;
  if (!out) throw new Error("Claude response did not parse against the compose schema");
  return { title: clip(out.title.trim(), 120), body: out.body.trim().slice(0, 8000) };
}
