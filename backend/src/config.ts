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

  // Cost safety: no auth yet, so these key off DEV_USER_ID / IP for now --
  // the same checks carry over once real per-user auth exists.
  dailyItemLimit: Number(optional("DAILY_ITEM_LIMIT") ?? 50),
  rateLimitMax: Number(optional("RATE_LIMIT_MAX") ?? 30),
  rateLimitWindowMs: Number(optional("RATE_LIMIT_WINDOW_MS") ?? 15 * 60 * 1000),
  maxImageBytes: Number(optional("MAX_IMAGE_BYTES") ?? 8 * 1024 * 1024),

  // Anthropic SDK reads ANTHROPIC_API_KEY itself; kept here only so routes
  // can check readiness before making a call.
  hasAnthropicKey: !!optional("ANTHROPIC_API_KEY"),

  supabaseUrl: optional("SUPABASE_URL"),
  supabaseServiceRoleKey: optional("SUPABASE_SERVICE_ROLE_KEY"),

  get hasSupabase() {
    return !!(this.supabaseUrl && this.supabaseServiceRoleKey);
  },
};

export { required };
