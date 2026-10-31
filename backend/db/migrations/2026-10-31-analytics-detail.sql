-- Which plan or screen an event on the way to Pro was about. Run before
-- deploying the server that sends it: without the column those events are lost.
alter table analytics_events add column if not exists detail text;
