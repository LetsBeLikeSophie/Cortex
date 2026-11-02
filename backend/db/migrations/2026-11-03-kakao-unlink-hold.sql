-- Paste into the Supabase SQL editor and run once. Safe to re-run.
-- Run this BEFORE deploying the server that needs it: the Kakao unlink
-- webhook and the daily retention job read and write unlinked_at.

-- Decision K1 (2026-11-02): unlinking Cortex from Kakao's settings holds the
-- account 30 days instead of deleting it at once. Logging in again with the
-- same Kakao account in that time brings it back; after it, the account and
-- its memos and photos are deleted.
alter table kakao_users add column if not exists unlinked_at timestamptz;

create index if not exists kakao_users_unlinked_at_idx on kakao_users (unlinked_at) where unlinked_at is not null;
