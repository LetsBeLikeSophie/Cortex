-- Consent to send saved content to the AI provider abroad (Anthropic, US).
-- Asked once in the app; nothing goes to the AI until it's 'agreed'.
-- Additive: null = not asked yet.
alter table user_plans add column if not exists ai_consent text;
alter table user_plans drop constraint if exists user_plans_ai_consent_check;
alter table user_plans add constraint user_plans_ai_consent_check
  check (ai_consent is null or ai_consent in ('agreed', 'declined'));
alter table user_plans add column if not exists ai_consent_at timestamptz;
-- Which notice text they answered (the privacy policy version it matched).
alter table user_plans add column if not exists ai_consent_version text;

-- An item saved without consent waits in 미분류함 for that reason.
alter table items drop constraint if exists items_unclassified_reason_check;
alter table items add constraint items_unclassified_reason_check
  check (unclassified_reason is null or unclassified_reason in ('quota', 'failed', 'consent'));
