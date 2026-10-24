-- Memo lock + 태그 정리하기. Paste into the Supabase SQL editor and run once.
-- Additive only and safe to re-run: the running server keeps working
-- before the new code ships.

-- A locked memo shows only its title until the device PIN (or fingerprint)
-- opens it, and is left out of AI search and 모아서 만들기. The PIN itself
-- never leaves the device.
alter table items add column if not exists locked boolean not null default false;

-- 태그 정리하기 is a metered AI use (free 1 / Pro 10 a month).
alter table ai_usage drop constraint if exists ai_usage_kind_check;
alter table ai_usage add constraint ai_usage_kind_check check (kind in ('classify', 'search', 'compose', 'tag_cleanup'));

alter table ai_calls drop constraint if exists ai_calls_purpose_check;
alter table ai_calls add constraint ai_calls_purpose_check
  check (purpose in ('classify_text', 'classify_link', 'classify_image', 'search', 'voice_tag', 'compose', 'tag_cleanup'));
