import * as cheerio from "cheerio";
import { config } from "../config.js";
import { fetchPublicHtml } from "./safeFetch.js";

export interface LinkMetadata {
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
  // YouTube Data API extras -- the creator's own hashtags/keywords and the
  // video length, both strong hints for tagging.
  tags?: string[];
  durationSec?: number;
  // The thumbnail is worth showing to the classifier too (YouTube: Shorts
  // and most uploads put their key words on the thumbnail).
  analyzeImage?: boolean;
}

const FETCH_TIMEOUT_MS = 8000;
// Preview tags sit at the top of the page; nothing past this is read.
const MAX_HTML_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;

// Only ever reads what a site already opts to publish for link previews
// (Open Graph tags, or YouTube's official oEmbed endpoint) -- deliberately
// not a general-purpose scraper. See the product discussion on why this is
// the safe boundary for closed platforms like Instagram.
export async function fetchLinkMetadata(url: string): Promise<LinkMetadata> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return {};
  }

  if (isYoutubeHost(parsed.hostname)) {
    // Official Data API first (title + full description + hashtags +
    // length); oEmbed (title/channel/thumbnail only) when there's no key or
    // the call fails. Neither touches the video itself -- captions are only
    // available to the video's owner through the official API.
    const id = youtubeVideoId(parsed);
    const viaApi = id && config.youtubeApiKey ? await fetchYoutubeData(id, config.youtubeApiKey) : null;
    if (viaApi) return viaApi;
    const oembed = await fetchYoutubeOEmbed(url);
    if (oembed) return { ...oembed, analyzeImage: true };
  }

  return fetchOpenGraph(url);
}

function isYoutubeHost(hostname: string): boolean {
  return hostname === "youtu.be" || /(^|\.)youtube\.com$/.test(hostname);
}

// watch?v=ID, youtu.be/ID, /shorts/ID, /live/ID, /embed/ID.
function youtubeVideoId(u: URL): string | null {
  if (u.hostname === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
  const v = u.searchParams.get("v");
  if (v) return v;
  const m = u.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{6,})/);
  return m ? m[1] : null;
}

// ISO 8601 duration (PT1H2M3S) -> seconds.
function parseDuration(iso?: string): number | undefined {
  const m = iso?.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return undefined;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

// Descriptions can run thousands of characters (link dumps, lyrics); the
// top is where creators put what matters (place, products, recipe), and
// the cap keeps the classify call cheap.
const DESCRIPTION_MAX = 1500;

async function fetchYoutubeData(id: string, key: string): Promise<LinkMetadata | null> {
  try {
    const api = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${encodeURIComponent(id)}&key=${encodeURIComponent(key)}`;
    const res = await fetch(api, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      items?: {
        snippet?: {
          title?: string;
          description?: string;
          channelTitle?: string;
          tags?: string[];
          thumbnails?: Record<string, { url?: string } | undefined>;
        };
        contentDetails?: { duration?: string };
      }[];
    };
    const video = data.items?.[0];
    if (!video?.snippet) return null;
    const { title, description, channelTitle, tags, thumbnails } = video.snippet;
    const thumb = thumbnails?.maxres?.url ?? thumbnails?.standard?.url ?? thumbnails?.high?.url ?? thumbnails?.medium?.url;
    return {
      title,
      description: description ? description.slice(0, DESCRIPTION_MAX) : undefined,
      siteName: channelTitle ? `YouTube · ${channelTitle}` : "YouTube",
      imageUrl: thumb,
      tags: tags?.slice(0, 15),
      durationSec: parseDuration(video.contentDetails?.duration),
      analyzeImage: !!thumb,
    };
  } catch {
    return null;
  }
}

async function fetchYoutubeOEmbed(url: string): Promise<LinkMetadata | null> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
    return {
      title: data.title,
      siteName: data.author_name ? `YouTube · ${data.author_name}` : "YouTube",
      imageUrl: data.thumbnail_url,
    };
  } catch {
    return null;
  }
}

async function fetchOpenGraph(url: string): Promise<LinkMetadata> {
  try {
    const html = await fetchPublicHtml(
      url,
      {
        // A plain, identifiable UA -- not spoofing a browser -- since this
        // only ever reads publicly-published preview meta tags.
        "user-agent": "CortexArchiveBot/1.0 (+link preview fetch)",
        accept: "text/html",
      },
      { timeoutMs: FETCH_TIMEOUT_MS, maxBytes: MAX_HTML_BYTES, maxRedirects: MAX_REDIRECTS }
    );
    if (html === null) return {};

    const $ = cheerio.load(html);
    const meta = (name: string) =>
      $(`meta[property="${name}"]`).attr("content") ?? $(`meta[name="${name}"]`).attr("content") ?? undefined;

    return {
      title: meta("og:title") ?? $("title").first().text().trim() ?? undefined,
      description: meta("og:description") ?? meta("description"),
      imageUrl: meta("og:image"),
      siteName: meta("og:site_name") ?? hostnameOf(url),
    };
  } catch {
    return {};
  }
}

function hostnameOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}
