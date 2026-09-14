import * as cheerio from "cheerio";

export interface LinkMetadata {
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
}

const FETCH_TIMEOUT_MS = 8000;

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
    const oembed = await fetchYoutubeOEmbed(url);
    if (oembed) return oembed;
  }

  return fetchOpenGraph(url);
}

function isYoutubeHost(hostname: string): boolean {
  return hostname === "youtu.be" || /(^|\.)youtube\.com$/.test(hostname);
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
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        // A plain, identifiable UA -- not spoofing a browser -- since this
        // only ever reads publicly-published preview meta tags.
        "user-agent": "CortexArchiveBot/1.0 (+link preview fetch)",
        accept: "text/html",
      },
    });
    if (!res.ok) return {};

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return {};

    const html = await res.text();
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
