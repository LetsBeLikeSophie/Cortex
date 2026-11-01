import { config } from "../config.js";
import { getClient } from "./supabase.js";

// Keeps the two usage logs from growing forever. Runs at startup and then
// once a day (see startRetentionJob).
// - ai_calls (one row per Claude call): detailed rows older than
//   config.aiCallsRetentionDays are first summed into ai_calls_monthly
//   (month x purpose x model), then deleted -- cost history survives as a
//   handful of rows per month.
// - ai_usage (quota counter): only the current month is ever read, so rows
//   from before last month are dropped.
// - purchases of deleted accounts: kept 5 years for refunds and tax.
// - app_errors: 90 days.

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH = 1000;

type CallRow = { id: number; created_at: string; purpose: string; model: string; input_tokens: number; output_tokens: number; cost_usd: number | null };

async function rollUpAndPruneAiCalls(): Promise<number> {
  const client = getClient();
  const cutoff = new Date(Date.now() - config.aiCallsRetentionDays * DAY_MS).toISOString();
  let pruned = 0;

  // Batch by batch: sum into the monthly table, then delete exactly the rows
  // that were summed (by id), so a crash between the two steps can at worst
  // re-count one batch, never lose one.
  for (;;) {
    const { data, error } = await client
      .from("ai_calls")
      .select("id, created_at, purpose, model, input_tokens, output_tokens, cost_usd")
      .lt("created_at", cutoff)
      .order("id")
      .limit(BATCH);
    if (error) throw new Error(`retention read failed: ${error.message}`);
    const rows = (data ?? []) as CallRow[];
    if (rows.length === 0) break;

    const sums = new Map<string, { month: string; purpose: string; model: string; calls: number; input_tokens: number; output_tokens: number; cost_usd: number }>();
    for (const r of rows) {
      const month = `${r.created_at.slice(0, 7)}-01`;
      const key = `${month}|${r.purpose}|${r.model}`;
      const s = sums.get(key) ?? { month, purpose: r.purpose, model: r.model, calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 };
      s.calls++;
      s.input_tokens += r.input_tokens;
      s.output_tokens += r.output_tokens;
      s.cost_usd += Number(r.cost_usd ?? 0);
      sums.set(key, s);
    }

    for (const s of sums.values()) {
      const { data: existing, error: readError } = await client
        .from("ai_calls_monthly")
        .select("calls, input_tokens, output_tokens, cost_usd")
        .eq("month", s.month)
        .eq("purpose", s.purpose)
        .eq("model", s.model)
        .maybeSingle();
      if (readError) throw new Error(`retention monthly read failed: ${readError.message}`);
      const { error: writeError } = await client.from("ai_calls_monthly").upsert({
        month: s.month,
        purpose: s.purpose,
        model: s.model,
        calls: (existing?.calls ?? 0) + s.calls,
        input_tokens: Number(existing?.input_tokens ?? 0) + s.input_tokens,
        output_tokens: Number(existing?.output_tokens ?? 0) + s.output_tokens,
        cost_usd: Number(existing?.cost_usd ?? 0) + s.cost_usd,
      });
      if (writeError) throw new Error(`retention monthly write failed: ${writeError.message}`);
    }

    const { error: deleteError } = await client.from("ai_calls").delete().in("id", rows.map((r) => r.id));
    if (deleteError) throw new Error(`retention delete failed: ${deleteError.message}`);
    pruned += rows.length;
    if (rows.length < BATCH) break;
  }
  return pruned;
}

async function pruneAiUsage(): Promise<void> {
  // Start of last month (UTC; a few hours' slack against the Korea-time
  // month the quota uses doesn't matter at this horizon).
  const now = new Date();
  const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString();
  const { error } = await getClient().from("ai_usage").delete().lt("created_at", lastMonthStart);
  if (error) throw new Error(`ai_usage prune failed: ${error.message}`);
}

async function pruneOldRecords(): Promise<void> {
  const client = getClient();
  const fiveYears = new Date(Date.now() - 5 * 365 * DAY_MS).toISOString();
  const { error: purchasesError } = await client.from("purchases").delete().is("user_id", null).lt("updated_at", fiveYears);
  if (purchasesError) throw new Error(`retention purchases failed: ${purchasesError.message}`);
  const ninetyDays = new Date(Date.now() - 90 * DAY_MS).toISOString();
  const { error: errorsError } = await client.from("app_errors").delete().lt("created_at", ninetyDays);
  if (errorsError) throw new Error(`retention app_errors failed: ${errorsError.message}`);
}

export async function runRetention(log: { info: (msg: string) => void; error: (err: unknown, msg: string) => void }): Promise<void> {
  try {
    const pruned = await rollUpAndPruneAiCalls();
    if (pruned > 0) log.info(`retention: rolled up and pruned ${pruned} ai_calls row(s)`);
  } catch (err) {
    log.error(err, "retention: ai_calls step failed");
  }
  try {
    await pruneAiUsage();
  } catch (err) {
    log.error(err, "retention: ai_usage step failed");
  }
  try {
    await pruneOldRecords();
  } catch (err) {
    log.error(err, "retention: old records step failed");
  }
}

export function startRetentionJob(log: Parameters<typeof runRetention>[0]): void {
  void runRetention(log);
  // unref: the timer alone never keeps the process alive.
  setInterval(() => void runRetention(log), DAY_MS).unref();
}
