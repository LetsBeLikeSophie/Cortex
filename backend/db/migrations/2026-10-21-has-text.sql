-- Screenshots: does the image carry readable text (set by classification,
-- null for links/text memos and for screenshots classified before this).
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
alter table items add column if not exists has_text boolean;
