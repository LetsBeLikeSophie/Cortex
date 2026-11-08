-- Mehh screenshot AI (docs/mehh-screenshot-ai.md). Paste into the Supabase
-- SQL editor and run once BEFORE setting MEHH_AI_ENABLED=1. Safe to re-run.
-- (Drafted 2026-11-08, not run yet.)
--
-- mehh_ai_usage: one row per analyzed batch -- how many photos, when, and
-- the SHA-256 of the Play purchase token (Mehh has no accounts; the token
-- itself is never stored). No image, no result, no device detail.
create table if not exists mehh_ai_usage (
  id bigserial primary key,
  purchase_hash text not null check (purchase_hash ~ '^[0-9a-f]{64}$'),
  photos integer not null check (photos > 0),
  created_at timestamptz not null default now()
);
create index if not exists mehh_ai_usage_hash_time_idx on mehh_ai_usage (purchase_hash, created_at);
alter table mehh_ai_usage enable row level security;

-- Counts and reserves in one step, locked per purchase, so two batches at
-- once can't both take the month's last room. Returns the row id (null when
-- nothing was granted), how many photos were granted, and the month's total
-- including them. Server-only (service role).
create or replace function mehh_ai_reserve(p_hash text, p_asked integer, p_limit integer, p_since timestamptz)
returns table (id bigint, granted integer, used integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
  v_granted integer;
  v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('mehh_ai:' || p_hash, 0));
  select coalesce(sum(u.photos), 0)::integer into v_used
    from mehh_ai_usage u
   where u.purchase_hash = p_hash and u.created_at >= p_since;
  v_granted := greatest(0, least(p_asked, p_limit - v_used));
  if v_granted > 0 then
    insert into mehh_ai_usage (purchase_hash, photos) values (p_hash, v_granted)
      returning mehh_ai_usage.id into v_id;
  end if;
  return query select v_id, v_granted, v_used + v_granted;
end;
$$;
revoke all on function mehh_ai_reserve(text, integer, integer, timestamptz) from public, anon, authenticated;

-- Per-call cost log gets the new purpose (user_id stays null for these).
alter table ai_calls drop constraint if exists ai_calls_purpose_check;
alter table ai_calls add constraint ai_calls_purpose_check
  check (purpose in ('classify_text', 'classify_link', 'classify_image', 'search', 'voice_tag', 'compose', 'tag_cleanup', 'mehh_screenshot'));
