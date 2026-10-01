-- Cortex archive schema (Supabase Postgres).
-- Run this once in the Supabase project's SQL editor (or via `supabase db push`).

create extension if not exists pgcrypto;

-- Fixed top-level categories the LLM classifies into -- intent-based ("why
-- save this") rather than topic-based, so any subject (food, fandom,
-- wedding planning, whatever) sorts into one of these regardless of what
-- it's about; the subject itself lives in tags instead. "기타" is the
-- deliberate catch-all. (This replaced an earlier topic-based list --
-- 맛집/여행/레시피/쇼핑/읽을거리/기타 -- see the migration note near the end of
-- this file for how existing rows were moved over.)
create type item_category as enum ('가볼 곳', '살 것', '배울 것', '볼 것', '기억할 것', '기타');

create type item_source as enum ('instagram', 'kakaotalk', 'safari', 'youtube', 'memo', 'other');

-- How the content was captured, since it changes what we can extract:
-- 'link'      -> a URL we could reach og:tags/oEmbed for
-- 'text'      -> raw text handed over by the share sheet (e.g. a KakaoTalk message)
-- 'screenshot'-> an image (e.g. an Instagram post capture) read via Claude vision
create type item_capture_type as enum ('link', 'text', 'screenshot');

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,

  source item_source not null,
  capture_type item_capture_type not null,

  -- raw input as received from the share sheet
  raw_url text,
  raw_text text,
  image_path text, -- Supabase Storage path, set when capture_type = 'screenshot'
  thumbnail_url text, -- external og:image/oEmbed preview URL, set when capture_type = 'link' and the site published one

  -- enriched by the pipeline (og:tags/oEmbed for links, Claude for text/images)
  title text,
  snippet text,
  category item_category not null default '기타',
  tags text[] not null default '{}', -- AI-assigned, read-only from the client
  user_tags text[] not null default '{}', -- user-added, freely add/removable

  shared_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz, -- soft delete: set on trash, cleared on restore, row
                          -- only actually removed on a permanent-delete call
  pinned_at timestamptz -- home screen's "즐겨찾기" tab: set when pinned, cleared
                         -- on unpin, ordered by this (most recently pinned first)
                         -- same shape as deleted_at above
);

create index if not exists items_user_id_shared_at_idx on items (user_id, shared_at desc) where deleted_at is null;
create index if not exists items_category_idx on items (user_id, category) where deleted_at is null;
create index if not exists items_trash_idx on items (user_id, deleted_at) where deleted_at is not null;
create index if not exists items_pinned_idx on items (user_id, pinned_at desc) where pinned_at is not null;

-- array_to_string/text[]::text are marked STABLE on this Postgres build
-- (collation-aware output), which Postgres refuses inside an index
-- expression. Our tags use the default deterministic collation, so this
-- thin IMMUTABLE wrapper is safe.
create or replace function immutable_tags_to_text(tags text[])
returns text
language sql
immutable
as $$ select array_to_string(tags, ' ') $$;

-- Simple search over title/snippet/tags/raw_text for v1. Swap for a proper
-- tsvector + GIN index once search quality/volume demands it.
create index if not exists items_search_idx on items
  using gin (
    to_tsvector(
      'simple'::regconfig,
      coalesce(title, '') || ' ' || coalesce(snippet, '') || ' ' ||
      coalesce(immutable_tags_to_text(tags), '') || ' ' || coalesce(raw_text, '')
    )
  );

alter table items enable row level security;

-- Real per-user policy now that the backend resolves auth.uid() from the
-- Supabase access token (see src/lib/auth.ts) instead of always using
-- DEV_USER_ID. Note this is defense-in-depth, not the primary guard: the
-- backend talks to Supabase with the service-role key, which bypasses RLS
-- entirely, so the actual access check happens in resolveUserId() before a
-- query is ever made. This matters if anything other than the backend
-- (e.g. the mobile app talking to Supabase directly) ever gets DB access.
--
-- If you're re-running this against a database that still has the old
-- "dev: allow all" policy, drop it first:
--   drop policy if exists "dev: allow all" on items;
create policy "users manage their own items" on items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Pseudonymous product analytics. `pseudonym` is an HMAC-SHA256 of the
-- user's id (see logAnalyticsEvent in src/lib/supabase.ts), never the id
-- itself -- lets us tell "same user, two events" apart from "two different
-- users" without being able to reverse the hash back to an account, so this
-- survives account deletion instead of needing to be destroyed with it.
-- No content fields (titles/text/tags) are ever logged here, only
-- category/source, which is enough to see usage patterns without carrying
-- anything personal.
create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  pseudonym text not null,
  event_type text not null, -- 'account_created' | 'account_deleted' | 'item_saved'
  category item_category,
  source item_source,
  occurred_at timestamptz not null default now()
);

create index if not exists analytics_events_pseudonym_idx on analytics_events (pseudonym);
create index if not exists analytics_events_type_time_idx on analytics_events (event_type, occurred_at);

-- Only the backend (service role, bypasses RLS) ever touches this table --
-- enabling RLS with no policies just makes that the enforced default
-- instead of an assumption, same as items above.
alter table analytics_events enable row level security;

-- kakao_id -> auth user id, so a returning user's login can look themselves
-- up with one indexed row read instead of admin.auth.admin.listUsers()
-- paging through up to 1000 accounts to find the matching email every
-- single time someone re-logs in (see loginWithKakaoCode in
-- src/lib/kakaoAuth.ts) -- that scan was the slow part of "login feels
-- slow" for any returning user, and it only gets worse as the user count
-- grows.
create table if not exists kakao_users (
  kakao_id text primary key,
  user_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists kakao_users_user_id_idx on kakao_users (user_id);

alter table kakao_users enable row level security;

-- Migration (2026-10-01): topic-based categories -> intent-based.
-- Postgres won't let an enum value be removed without recreating the type,
-- so the old five stay as orphaned, unused members rather than forcing a
-- disruptive rebuild -- same tradeoff as the unused `pinned_at` column
-- above. Run each ALTER TYPE as its own statement (a value just added
-- can't be referenced in the same transaction/statement batch on some PG
-- versions), then the UPDATE.
--
-- alter type item_category add value if not exists '가고 싶은 곳';
-- alter type item_category add value if not exists '사고 싶은 것';
-- alter type item_category add value if not exists '배우고 싶은 것';
-- alter type item_category add value if not exists '나중에 볼 것';
-- alter type item_category add value if not exists '기억해둘 것';
--
-- update items set category = '가고 싶은 곳' where category in ('맛집', '여행');
-- update items set category = '배우고 싶은 것' where category = '레시피';
-- update items set category = '사고 싶은 것' where category = '쇼핑';
-- update items set category = '나중에 볼 것' where category = '읽을거리';
-- ('기타' needed no remapping -- it's unchanged in the new list.)

-- Migration (2026-10-01, same day): the five new values above read too
-- long in a small/mono-spaced UI spot -- shortened to the same intent,
-- fewer syllables. A rename (not add+remap) since Postgres enum values
-- are stored by OID, not by label -- every existing row just follows the
-- new spelling automatically, no UPDATE needed.
--
-- alter type item_category rename value '가고 싶은 곳' to '가볼 곳';
-- alter type item_category rename value '사고 싶은 것' to '살 것';
-- alter type item_category rename value '배우고 싶은 것' to '배울 것';
-- alter type item_category rename value '나중에 볼 것' to '볼 것';
-- alter type item_category rename value '기억해둘 것' to '기억할 것';
