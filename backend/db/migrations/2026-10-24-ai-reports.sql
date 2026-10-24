-- In-app reports of AI output (Google Play AI-Generated Content policy:
-- people must be able to flag offensive or wrong AI output without leaving
-- the app). Paste into the Supabase SQL editor and run once. Safe to re-run.
--
-- A copy of what the AI wrote at report time is kept, so the report still
-- makes sense after the memo is edited or re-organized. Deleted with the
-- account (deleteUserAccount).
create table if not exists ai_reports (
  id bigserial primary key,
  user_id uuid not null,
  item_id uuid,
  title text,
  snippet text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists ai_reports_user_idx on ai_reports (user_id);
alter table ai_reports enable row level security;
