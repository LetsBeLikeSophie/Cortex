-- One save, one item, even when the app sends it twice (a request that timed
-- out on a slow connection but did reach the server, then a retry; or the
-- Mehh queue re-uploading). Paste into the Supabase SQL editor and run once.
-- Additive only and safe to re-run: until it runs, the server simply saves
-- without this check, as before.

-- The app's own id for a save, the same on every retry of it.
alter table items add column if not exists client_request_id text;

-- At most one item per person per request id (several null ids are fine).
create unique index if not exists items_user_client_request_id
  on items (user_id, client_request_id)
  where client_request_id is not null;
