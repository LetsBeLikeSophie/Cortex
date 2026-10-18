-- Free/Pro plans + monthly AI quotas (same statements as the 2026-10-18
-- block at the end of db/schema.sql). Paste into the Supabase SQL editor
-- and run once. Safe to re-run.

alter table items drop constraint if exists items_classification_status_check;
alter table items add constraint items_classification_status_check
  check (classification_status in ('pending', 'done', 'failed', 'unclassified'));

create table if not exists user_plans (
  user_id uuid primary key,
  trial_ends_at timestamptz not null,
  pro_until timestamptz,
  created_at timestamptz not null default now()
);
alter table user_plans enable row level security;

create table if not exists ai_usage (
  id bigserial primary key,
  user_id uuid not null,
  kind text not null check (kind in ('classify', 'search')),
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_kind_time_idx on ai_usage (user_id, kind, created_at);
alter table ai_usage enable row level security;
