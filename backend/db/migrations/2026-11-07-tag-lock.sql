-- Tag lock (Sophie, 2026-11-07): a whole tag opens only with the memo-lock
-- PIN. Paste into the Supabase SQL editor and run once before deploying the
-- server that uses it. Safe to re-run.
--
-- locked_tags: which tags a person locked (deleted with the account,
-- moved with a guest claim).
-- items.locked_by_tag: the memo is locked because of a locked tag, so
-- unlocking the tag opens it again (a memo locked by hand stays locked).
create table if not exists locked_tags (
  user_id uuid not null,
  tag text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, tag)
);
alter table locked_tags enable row level security;

alter table items add column if not exists locked_by_tag boolean not null default false;
