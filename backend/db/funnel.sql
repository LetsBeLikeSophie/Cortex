-- The way to Pro, last 30 days: people (not events) at each step. Read-only.
-- 'quota_hit' by detail is what to look at before changing the free 50.
select event_type, coalesce(detail, '-') as detail, count(distinct pseudonym) as people, count(*) as events
from analytics_events
where occurred_at > now() - interval '30 days'
  and event_type in ('account_created', 'quota_hit', 'paywall_view', 'purchase_started', 'purchase_done', 'subscription_canceled', 'subscription_expired', 'purchase_refunded')
group by 1, 2
order by 1, 2;

-- Who is active against who hits a limit.
select
  count(distinct pseudonym) filter (where event_type = 'item_saved') as saved_something,
  count(distinct pseudonym) filter (where event_type = 'quota_hit') as hit_a_limit
from analytics_events
where occurred_at > now() - interval '30 days';
