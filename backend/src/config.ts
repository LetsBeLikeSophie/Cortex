import "dotenv/config";

function optional(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

function required(name: string): string {
  const v = optional(name);
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  port: Number(optional("PORT") ?? 8787),

  // Cost safety: dailyItemLimit is checked per real signed-in user id (see
  // resolveUserId), rateLimitMax is IP-keyed (fastify/rate-limit's default)
  // since it runs before auth resolves.
  // Saving is unlimited by plan; these two are only abuse ceilings, set
  // well above any real burst (a 30-photo multi-pick, several in a row).
  // AI cost is bounded separately by the monthly quotas below.
  dailyItemLimit: Number(optional("DAILY_ITEM_LIMIT") ?? 500),
  rateLimitMax: Number(optional("RATE_LIMIT_MAX") ?? 150),
  rateLimitWindowMs: Number(optional("RATE_LIMIT_WINDOW_MS") ?? 15 * 60 * 1000),
  // Burst limit for natural-language search (its own, separate from
  // rateLimitMax). The monthly free quota on it lives in plans.ts.
  searchRateLimitMax: Number(optional("SEARCH_RATE_LIMIT_MAX") ?? 60),
  maxImageBytes: Number(optional("MAX_IMAGE_BYTES") ?? 8 * 1024 * 1024),

  // Plans (see src/lib/plans.ts). Free classification is enough for a
  // daily habit (50/month, raised from 30 on 2026-10-21: 30 ran out in a
  // week and broke the habit); heavier use piles up in 미분류함, which is
  // the reason to upgrade -- not API cost (an item costs well under 1원).
  // Pro's numbers are a stated monthly ceiling (shown on the paywall).
  freeClassifyMonthly: Number(optional("FREE_CLASSIFY_MONTHLY") ?? 50),
  freeSearchMonthly: Number(optional("FREE_SEARCH_MONTHLY") ?? 10),
  proClassifyMonthly: Number(optional("PRO_CLASSIFY_MONTHLY") ?? 2000),
  proSearchMonthly: Number(optional("PRO_SEARCH_MONTHLY") ?? 300),
  trialDays: Number(optional("TRIAL_DAYS") ?? 7),

  // Detailed per-call AI log retention (src/lib/retention.ts); older rows
  // are summed into ai_calls_monthly, then deleted.
  aiCallsRetentionDays: Number(optional("AI_CALLS_RETENTION_DAYS") ?? 90),

  // Anthropic SDK reads ANTHROPIC_API_KEY itself; kept here only so routes
  // can check readiness before making a call.
  hasAnthropicKey: !!(
    optional("ANTHROPIC_API_KEY") ||
    (optional("ANTHROPIC_API_KEY_CLASSIFY") && optional("ANTHROPIC_API_KEY_SEARCH") && optional("ANTHROPIC_API_KEY_VOICE"))
  ),

  // YouTube Data API v3 key (Google Cloud console, free quota). Optional:
  // without it YouTube links fall back to oEmbed (title + channel only).
  youtubeApiKey: optional("YOUTUBE_API_KEY"),

  supabaseUrl: optional("SUPABASE_URL"),
  supabaseServiceRoleKey: optional("SUPABASE_SERVICE_ROLE_KEY"),

  get hasSupabase() {
    return !!(this.supabaseUrl && this.supabaseServiceRoleKey);
  },
};

export { required };
