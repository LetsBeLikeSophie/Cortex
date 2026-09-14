-- Cortex archive schema (Supabase Postgres).
-- Run this once in the Supabase project's SQL editor (or via `supabase db push`).

create extension if not exists pgcrypto;

-- Fixed top-level categories the LLM classifies into. "기타" is the
-- deliberate catch-all discussed for v1 -- revisit this list once real
-- usage data shows what people actually share.
create type item_category as enum ('맛집', '여행', '레시피', '쇼핑', '읽을거리', '기타');

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

  -- enriched by the pipeline (og:tags/oEmbed for links, Claude for text/images)
  title text,
  snippet text,
  category item_category not null default '기타',
  tags text[] not null default '{}',

  shared_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists items_user_id_shared_at_idx on items (user_id, shared_at desc);
create index if not exists items_category_idx on items (user_id, category);

-- Simple search over title/snippet/tags/raw_text for v1. Swap for a proper
-- tsvector + GIN index once search quality/volume demands it.
create index if not exists items_search_idx on items
  using gin (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' || coalesce(snippet, '') || ' ' ||
      coalesce(array_to_string(tags, ' '), '') || ' ' || coalesce(raw_text, '')
    )
  );

alter table items enable row level security;

-- Placeholder policy for single-user/dev use. Replace with a real
-- auth.uid() = user_id check once user auth is wired up.
create policy "dev: allow all" on items for all using (true) with check (true);
