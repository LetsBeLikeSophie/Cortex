-- 2026-10-23 decisions (Q2, Q4, Q7). Additive only: every column is
-- nullable or has a default, so the running server keeps working before
-- the new code ships.

-- Q2: why an item sits in 미분류함. 'quota' = the month's AI organizes ran
-- out; 'failed' = the AI gave up on it (refunded). null = older rows /
-- not unclassified.
alter table items add column if not exists unclassified_reason text;
alter table items drop constraint if exists items_unclassified_reason_check;
alter table items add constraint items_unclassified_reason_check
  check (unclassified_reason is null or unclassified_reason in ('quota', 'failed'));

-- Q4: AI tags the person removed from this item -- a re-organize never
-- puts them back.
alter table items add column if not exists removed_tags text[] not null default '{}';

-- Q7: a 모아서 만들기 memo remembers which items it was made from (shown
-- as "원본 N개", and such memos are left out of the next compose's
-- materials).
alter table items add column if not exists composed_from uuid[];
