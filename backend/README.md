# Cortex backend

Ingest, enrichment, and search API for the Cortex archive app. Node.js + TypeScript + Fastify.

## What this does

Three capture types, all converging into one enriched record:

- **link** (Safari/KakaoTalk/YouTube URLs) -> fetch Open Graph tags (or YouTube's oEmbed) -> Claude classifies into a title/snippet/category/tags
- **text** (e.g. a KakaoTalk message with no link) -> Claude classifies the raw text directly
- **screenshot** (e.g. an Instagram capture, since Instagram doesn't expose post content via API) -> uploaded to Supabase Storage -> Claude *vision* reads the caption/text in the image and classifies it

This mirrors the product discussion: Instagram's external share only ever hands over a bare link with no caption/image/author, and Instagram's oEmbed requires a Meta app + token and mostly refuses arbitrary posts anyway -- so for that source the plan is to lean on a user-taken screenshot instead of scraping.

Categories are a fixed list (`src/lib/categories.ts`, mirrored in `db/schema.sql`'s `item_category` enum): 맛집 / 여행 / 레시피 / 쇼핑 / 읽을거리 / 기타. Tags are freeform, assigned by Claude per item.

## What you need to supply

This scaffold has no working credentials -- it can't, since these are yours to create:

1. **A Supabase project** (free tier is fine to start): create one at supabase.com, then run `db/schema.sql` in its SQL editor, and create a Storage bucket named `item-screenshots` (private is fine -- the app reads via a service-role client).
2. **An Anthropic API key**: console.anthropic.com -> API Keys.

Copy `.env.example` to `.env` and fill both in.

No custom domain needed -- Supabase and whatever host you deploy this to (Render/Railway/Fly.io all work) give you a working URL out of the box. A domain only matters later for deep-linking or a marketing page, and you can point a subdomain of a domain you already own at it whenever that comes up.

## Run it

```bash
npm install
cp .env.example .env   # fill in the two credentials above
npm run dev            # tsx watch, http://localhost:8787
```

`GET /health` reports whether each credential is configured without leaking the values.

## Endpoints

- `POST /items` -- body is one of the three capture-type shapes in `src/lib/pipeline.ts` (`IncomingItemSchema`)
- `GET /items?limit=30` -- recent items, newest first
- `GET /items/search?q=제주` -- ILIKE search over title/snippet/raw text

## Known placeholders (by design, not oversight)

- **No auth yet.** Every request reads/writes a single hardcoded `DEV_USER_ID` (`src/lib/devUser.ts`), and the DB's row-level-security policy is wide open (`db/schema.sql`, "dev: allow all"). Both need replacing together once there's real user login.
- **Search is `ILIKE`, not full-text.** Good enough for early volume; the schema already carries a `tsvector` GIN index (`items_search_idx`) to switch to when it isn't.
