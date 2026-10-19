// AI usage/cost report from the ai_calls log (src/lib/aiLog.ts), plus the
// monthly roll-ups retention.ts keeps once detailed rows age out.
//   npx.cmd tsx scripts/ai-usage.ts            -> last 30 days
//   npx.cmd tsx scripts/ai-usage.ts --days 7
// Read-only. Won is a rough conversion for reading, not billing.
import "dotenv/config";
import { getClient } from "../src/lib/supabase.js";

const daysArg = process.argv.indexOf("--days");
const days = daysArg > -1 ? Number(process.argv[daysArg + 1]) : 30;
const KRW_PER_USD = 1400;
const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

type Row = { created_at: string; user_id: string | null; purpose: string; input_tokens: number; output_tokens: number; cost_usd: number | null };
const rows: Row[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await getClient()
    .from("ai_calls")
    .select("created_at, user_id, purpose, input_tokens, output_tokens, cost_usd")
    .gte("created_at", since)
    .order("created_at")
    .range(from, from + 999);
  if (error) throw error;
  rows.push(...((data ?? []) as Row[]));
  if (!data || data.length < 1000) break;
}

const won = (usd: number) => `${(usd * KRW_PER_USD).toFixed(1)}원`;
function table(title: string, key: (r: Row) => string) {
  const g = new Map<string, { calls: number; inTok: number; outTok: number; usd: number }>();
  for (const r of rows) {
    const k = key(r);
    const e = g.get(k) ?? { calls: 0, inTok: 0, outTok: 0, usd: 0 };
    e.calls++;
    e.inTok += r.input_tokens;
    e.outTok += r.output_tokens;
    e.usd += Number(r.cost_usd ?? 0);
    g.set(k, e);
  }
  console.log(`\n== ${title}`);
  for (const [k, e] of [...g.entries()].sort((a, b) => b[1].usd - a[1].usd)) {
    console.log(`${k.padEnd(38)} ${String(e.calls).padStart(5)} calls  in ${String(e.inTok).padStart(8)}  out ${String(e.outTok).padStart(7)}  ${won(e.usd).padStart(9)}  (per call ${won(e.usd / e.calls)})`);
  }
}

const total = rows.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
console.log(`last ${days} days: ${rows.length} calls, ${won(total)} ($${total.toFixed(4)})`);
table("by feature", (r) => r.purpose);
table("by day", (r) => r.created_at.slice(0, 10));
table("by account (top 10 shown first)", (r) => r.user_id ?? "(deleted account)");

// Older than the detailed-log window: what retention.ts summed up per month.
const { data: monthly, error: monthlyError } = await getClient()
  .from("ai_calls_monthly")
  .select("month, purpose, calls, cost_usd")
  .order("month", { ascending: false });
if (monthlyError) {
  console.log(`
(monthly roll-up unavailable: ${monthlyError.message})`);
} else if (monthly && monthly.length > 0) {
  console.log("
== rolled-up months (older than the detailed log)");
  for (const m of monthly) {
    console.log(`${String(m.month).slice(0, 7)}  ${m.purpose.padEnd(16)} ${String(m.calls).padStart(6)} calls  ${won(Number(m.cost_usd)).padStart(9)}`);
  }
}
