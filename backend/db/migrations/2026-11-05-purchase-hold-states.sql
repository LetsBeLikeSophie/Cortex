-- Decision B1 (2026-11-05): a renewal payment that failed is kept as its own
-- state instead of "active" or "expired", so the Pro screen can say so.
--   grace   -- Play is retrying; Pro continues
--   on_hold -- retries ran out; Pro is off until the payment is fixed
-- Run before deploying the server that writes these states.
alter table purchases drop constraint if exists purchases_state_check;
alter table purchases add constraint purchases_state_check
  check (state in ('active', 'grace', 'on_hold', 'pending', 'canceled', 'expired', 'refunded'));
