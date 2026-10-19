-- Per-call AI usage/cost log. Paste into the Supabase SQL editor and run once. Safe to re-run.

create table if not exists ai_calls (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  user_id uuid,
  purpose text not null check (purpose in ('classify_text', 'classify_link', 'classify_image', 'search', 'voice_tag')),
  model text not null,
  input_tokens integer not null,
  output_tokens integer not null,
  cost_usd numeric(12, 8)
);
create index if not exists ai_calls_time_idx on ai_calls (created_at);
create index if not exists ai_calls_user_time_idx on ai_calls (user_id, created_at);
alter table ai_calls enable row level security;
