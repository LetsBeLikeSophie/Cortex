import { config } from "../config.js";
import { getClient } from "./supabase.js";

// Free vs Pro, and the monthly AI quotas behind them. Saving is never
// limited -- only the Claude-backed work is: auto-classification (over
// quota, items save as 'unclassified' and wait in 미분류함) and sentence
// search. New Kakao accounts get a trial with Pro limits; guests don't
// (a guest is one tap to create and reinstalling makes a fresh one, so a
// guest trial could be re-taken endlessly).

export type Tier = "free" | "trial" | "pro";
export type UsageKind = "classify" | "search" | "compose";

export interface Entitlement {
  tier: Tier;
  trialEndsAt: string;
  proUntil: string | null;
  classify: { used: number; limit: number };
  // What Pro includes, so the paywall states the real monthly ceilings
  // instead of "unlimited".
  proLimits: { classify: number; search: number; compose: number };
  search: { used: number; limit: number };
  // "모아서 만들기" (compose) runs this month.
  compose: { used: number; limit: number };
  // When this month's quota resets (start of next month, Korea time).
  resetsAt: string;
  unclassifiedCount: number;
}

const KST_MS = 9 * 60 * 60 * 1000;

// Calendar month in Korea time, as UTC instants.
function monthWindow(now = new Date()): { start: Date; next: Date } {
  const k = new Date(now.getTime() + KST_MS);
  const start = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), 1) - KST_MS);
  const next = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth() + 1, 1) - KST_MS);
  return { start, next };
}

// Lazily creates the plan row the first time an account is seen -- which is
// also when a Kakao account's trial starts. A guest (anonymous) account's
// row is created with its trial already over. Guests can't be upgraded to
// Kakao in place (a Kakao login is a separate account), so this is decided
// once, at creation.
async function getPlanRow(userId: string): Promise<{ trial_ends_at: string; pro_until: string | null }> {
  const client = getClient();
  const { data, error } = await client.from("user_plans").select("trial_ends_at, pro_until").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`getPlanRow failed: ${error.message}`);
  if (data) return data;

  // Throws on a lookup failure rather than guessing: no row is written, and
  // the next request tries again.
  const { data: authUser, error: authError } = await client.auth.admin.getUserById(userId);
  if (authError || !authUser.user) throw new Error(`getPlanRow user lookup failed: ${authError?.message ?? "no user"}`);
  const trialMs = authUser.user.is_anonymous ? 0 : config.trialDays * 24 * 60 * 60 * 1000;
  const trialEndsAt = new Date(Date.now() + trialMs).toISOString();
  const { error: insertError } = await client
    .from("user_plans")
    .upsert({ user_id: userId, trial_ends_at: trialEndsAt }, { onConflict: "user_id", ignoreDuplicates: true });
  if (insertError) throw new Error(`getPlanRow insert failed: ${insertError.message}`);
  // Re-read so a concurrent first request that won the insert wins here too.
  const { data: row, error: rereadError } = await client.from("user_plans").select("trial_ends_at, pro_until").eq("user_id", userId).single();
  if (rereadError) throw new Error(`getPlanRow reread failed: ${rereadError.message}`);
  return row;
}

async function countUsage(userId: string, kind: UsageKind, since: Date): Promise<number> {
  const { count, error } = await getClient()
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", kind)
    .gte("created_at", since.toISOString());
  if (error) throw new Error(`countUsage failed: ${error.message}`);
  return count ?? 0;
}

async function countUnclassified(userId: string): Promise<number> {
  const { count, error } = await getClient()
    .from("items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("classification_status", "unclassified")
    .is("deleted_at", null);
  if (error) throw new Error(`countUnclassified failed: ${error.message}`);
  return count ?? 0;
}

export async function getEntitlement(userId: string): Promise<Entitlement> {
  const row = await getPlanRow(userId);
  const now = Date.now();
  const tier: Tier =
    row.pro_until && new Date(row.pro_until).getTime() > now
      ? "pro"
      : new Date(row.trial_ends_at).getTime() > now
        ? "trial"
        : "free";
  const paid = tier !== "free";
  const { start, next } = monthWindow();
  // On the free plan, what the trial used doesn't count: the month's free
  // share starts fresh the moment the trial ends (decision Q9, 2026-10-23).
  const trialEnd = new Date(row.trial_ends_at);
  const since = tier === "free" && trialEnd > start ? trialEnd : start;
  const [classifyUsed, searchUsed, composeUsed, unclassifiedCount] = await Promise.all([
    countUsage(userId, "classify", since),
    countUsage(userId, "search", since),
    countUsage(userId, "compose", since),
    countUnclassified(userId),
  ]);
  return {
    tier,
    trialEndsAt: row.trial_ends_at,
    proUntil: row.pro_until,
    classify: { used: classifyUsed, limit: paid ? config.proClassifyMonthly : config.freeClassifyMonthly },
    search: { used: searchUsed, limit: paid ? config.proSearchMonthly : config.freeSearchMonthly },
    compose: { used: composeUsed, limit: paid ? config.proComposeMonthly : config.freeComposeMonthly },
    proLimits: { classify: config.proClassifyMonthly, search: config.proSearchMonthly, compose: config.proComposeMonthly },
    resetsAt: next.toISOString(),
    unclassifiedCount,
  };
}

export function remaining(ent: Entitlement, kind: UsageKind): number {
  return Math.max(0, ent[kind].limit - ent[kind].used);
}

export async function recordUsage(userId: string, kind: UsageKind): Promise<void> {
  await reserveUsage(userId, kind);
}

// Counts the use up front -- the moment a save is accepted for AI
// classification, not when the classification eventually finishes -- so a
// 30-photo batch shows as 30 used right away. Returns the row id so a job
// that ultimately fails can hand it back (refundUsage).
export async function reserveUsage(userId: string, kind: UsageKind): Promise<number> {
  const { data, error } = await getClient().from("ai_usage").insert({ user_id: userId, kind }).select("id").single();
  if (error) throw new Error(`reserveUsage failed: ${error.message}`);
  return data.id as number;
}

export async function refundUsage(id: number): Promise<void> {
  const { error } = await getClient().from("ai_usage").delete().eq("id", id);
  if (error) throw new Error(`refundUsage failed: ${error.message}`);
}
