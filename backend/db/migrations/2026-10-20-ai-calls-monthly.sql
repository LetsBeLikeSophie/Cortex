-- Monthly roll-up of ai_calls (see src/lib/retention.ts). Detailed per-call
-- rows are kept 90 days; older ones are summed into this table first, then
-- deleted, so long-run cost history survives without unbounded growth.
-- Paste into the Supabase SQL editor and run once. Safe to re-run.

create table if not exists ai_calls_monthly (
  month date not null,              -- first day of the month (UTC)
  purpose text not null,
  model text not null,
  calls integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_usd numeric(14, 8) not null default 0,
  primary key (month, purpose, model)
);
alter table ai_calls_monthly enable row level security;
