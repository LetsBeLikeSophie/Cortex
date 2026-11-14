-- Mehh free AI coins (docs/mehh-screenshot-ai.md "Free coins", Sophie 11-14).
-- Paste into the Supabase SQL editor and run once BEFORE deploying the
-- server that calls these. Safe to re-run.
--
-- What is kept, per install of Mehh from Google Play (no account, no device
-- detail): the SHA-256 of a random id the app made at install, how many
-- coins it has, the month of its last refill, and per AI session how many
-- photos were analyzed and when. No image, no result, no Integrity verdict.
-- Privacy policy / Play data safety: "an app-generated install id (hashed)
-- and AI usage counts, to limit free AI analysis" (see the doc).

create table if not exists mehh_free_installs (
  install_hash text primary key check (install_hash ~ '^[0-9a-f]{64}$'),
  coins integer not null check (coins >= 0),
  last_refill text not null check (last_refill ~ '^\d{4}-\d{2}$'),
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
alter table mehh_free_installs enable row level security;

create table if not exists mehh_free_sessions (
  id uuid primary key default gen_random_uuid(),
  install_hash text not null references mehh_free_installs (install_hash) on delete cascade,
  kind text not null check (kind in ('screenshots', 'day')),
  photos_used integer not null default 0 check (photos_used >= 0),
  created_at timestamptz not null default now()
);
create index if not exists mehh_free_sessions_time_idx on mehh_free_sessions (created_at);
alter table mehh_free_sessions enable row level security;

-- Refill (one coin a month up to p_max, 3 for a new install), then spend one
-- coin on a new session. Locked per install so two taps can't both take the
-- last coin. Returns the session id (null when no coin was left) and the
-- coins left after this. Same rule as coinsNow() in src/lib/mehhRules.ts.
create or replace function mehh_free_start(p_install text, p_month text, p_first integer, p_max integer, p_kind text)
returns table (session uuid, coins integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coins integer;
  v_last text;
  v_months integer;
  v_session uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('mehh_free:' || p_install, 0));
  select i.coins, i.last_refill into v_coins, v_last from mehh_free_installs i where i.install_hash = p_install;
  if not found then
    v_coins := p_first;
    v_last := p_month;
    insert into mehh_free_installs (install_hash, coins, last_refill) values (p_install, v_coins, v_last);
  elsif p_month > v_last then
    v_months := (extract(year from to_date(p_month || '-01', 'YYYY-MM-DD'))::integer * 12 + extract(month from to_date(p_month || '-01', 'YYYY-MM-DD'))::integer)
              - (extract(year from to_date(v_last || '-01', 'YYYY-MM-DD'))::integer * 12 + extract(month from to_date(v_last || '-01', 'YYYY-MM-DD'))::integer);
    v_coins := least(p_max, v_coins + greatest(0, v_months));
    v_last := p_month;
  end if;
  if v_coins > 0 then
    v_coins := v_coins - 1;
    insert into mehh_free_sessions (install_hash, kind) values (p_install, p_kind) returning mehh_free_sessions.id into v_session;
  end if;
  update mehh_free_installs set coins = v_coins, last_refill = v_last, last_seen = now() where install_hash = p_install;
  return query select v_session, v_coins;
end;
$$;
revoke all on function mehh_free_start(text, text, integer, integer, text) from public, anon, authenticated;

-- Takes room for a batch in an open session (younger than p_since cutoff,
-- under p_max photos) and under the day's ceiling for all free AI
-- (p_day_cap photos since p_day_start). Returns how many were granted and
-- the session's total. Server-only.
create or replace function mehh_free_reserve(p_session uuid, p_asked integer, p_max integer, p_since timestamptz, p_day_start timestamptz, p_day_cap integer)
returns table (granted integer, used integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
  v_created timestamptz;
  v_day integer;
  v_granted integer;
begin
  select s.photos_used, s.created_at into v_used, v_created from mehh_free_sessions s where s.id = p_session for update;
  if not found or v_created < p_since then
    return query select 0, coalesce(v_used, 0);
    return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('mehh_free_day', 0));
  select coalesce(sum(s.photos_used), 0)::integer into v_day from mehh_free_sessions s where s.created_at >= p_day_start;
  v_granted := greatest(0, least(p_asked, p_max - v_used, p_day_cap - v_day));
  update mehh_free_sessions set photos_used = photos_used + v_granted where id = p_session;
  return query select v_granted, v_used + v_granted;
end;
$$;
revoke all on function mehh_free_reserve(uuid, integer, integer, timestamptz, timestamptz, integer) from public, anon, authenticated;

-- The AI call failed: those photos weren't looked at, so they don't count.
create or replace function mehh_free_refund(p_session uuid, p_photos integer)
returns void
language sql
security definer
set search_path = public
as $$
  update mehh_free_sessions set photos_used = greatest(0, photos_used - p_photos) where id = p_session;
$$;
revoke all on function mehh_free_refund(uuid, integer) from public, anon, authenticated;

-- Day-set analysis gets its own purpose in the cost log.
alter table ai_calls drop constraint if exists ai_calls_purpose_check;
alter table ai_calls add constraint ai_calls_purpose_check
  check (purpose in ('classify_text', 'classify_link', 'classify_image', 'search', 'voice_tag', 'compose', 'tag_cleanup', 'mehh_screenshot', 'mehh_day'));
