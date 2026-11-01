-- Paste into the Supabase SQL editor and run once. Safe to re-run.
-- Run this BEFORE deploying the server that needs it: account deletion writes
-- user_id = null, and app errors go to app_errors.

-- Decision C2 (2026-11-01): a deleted account's purchase stays for 5 years as a
-- record (refunds, tax), without saying whose it was.
alter table purchases alter column user_id drop not null;

-- Purchases of accounts deleted before this: same treatment.
update purchases
set user_id = null, raw = null
where user_id is not null
  and user_id not in (select id from auth.users);

-- Decision E1 (2026-11-01): where the app broke, with no account and nothing the
-- person wrote: no error message, only the code position. Kept 90 days.
create table if not exists app_errors (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  app_version text not null,
  name text not null,
  stack text not null
);
create index if not exists app_errors_time_idx on app_errors (created_at);
alter table app_errors enable row level security;
