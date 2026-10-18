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
  dailyItemLimit: Number(optional("DAILY_ITEM_LIMIT") ?? 50),
  rateLimitMax: Number(optional("RATE_LIMIT_MAX") ?? 30),
  rateLimitWindowMs: Number(optional("RATE_LIMIT_WINDOW_MS") ?? 15 * 60 * 1000),
  // Natural-language search calls Claude too, but people search far more
  // often than they save, so it gets its own (looser) burst limit in the
  // same window instead of sharing rateLimitMax. No monthly quota on it.
  searchRateLimitMax: Number(optional("SEARCH_RATE_LIMIT_MAX") ?? 60),
  maxImageBytes: Number(optional("MAX_IMAGE_BYTES") ?? 8 * 1024 * 1024),

  // Plans (see src/lib/plans.ts). Free quotas are deliberately tight -- the
  // point is that unclassified saves visibly pile up in 미분류함 and that's
  // the reason to upgrade, not API cost (an item costs well under 1원).
  // Pro is sold as unlimited; its numbers are only a fair-use ceiling.
  freeClassifyMonthly: Number(optional("FREE_CLASSIFY_MONTHLY") ?? 30),
  freeSearchMonthly: Number(optional("FREE_SEARCH_MONTHLY") ?? 10),
  proClassifyMonthly: Number(optional("PRO_CLASSIFY_MONTHLY") ?? 2000),
  proSearchMonthly: Number(optional("PRO_SEARCH_MONTHLY") ?? 300),
  trialDays: Number(optional("TRIAL_DAYS") ?? 7),

  // Anthropic SDK reads ANTHROPIC_API_KEY itself; kept here only so routes
  // can check readiness before making a call.
  hasAnthropicKey: !!optional("ANTHROPIC_API_KEY"),

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
