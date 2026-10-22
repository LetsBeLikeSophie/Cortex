-- Billing (Google Play now, web later) + "모아서 만들기" (compose).
-- Paste into the Supabase SQL editor and run once. Safe to re-run.

-- One row per store purchase. purchase_token is unique across accounts so a
-- token can't be replayed onto a second account. user_plans.pro_until is
-- recomputed from these rows (lifetime -> far future, subscription ->
-- its current expiry).
create table if not exists purchases (
  id bigserial primary key,
  user_id uuid not null,
  store text not null check (store in ('google', 'web')),
  product_id text not null,
  purchase_token text not null unique,
  kind text not null check (kind in ('subscription', 'lifetime')),
  expires_at timestamptz,
  state text not null check (state in ('active', 'pending', 'canceled', 'expired', 'refunded')),
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists purchases_user_idx on purchases (user_id);
alter table purchases enable row level security;

-- Monthly quota and the AI call log gain the 'compose' kind.
alter table ai_usage drop constraint if exists ai_usage_kind_check;
alter table ai_usage add constraint ai_usage_kind_check check (kind in ('classify', 'search', 'compose'));

alter table ai_calls drop constraint if exists ai_calls_purpose_check;
alter table ai_calls add constraint ai_calls_purpose_check
  check (purpose in ('classify_text', 'classify_link', 'classify_image', 'search', 'voice_tag', 'compose'));
