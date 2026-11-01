import { config } from "../config.js";
import { createDailyBudget } from "./aiBudget.js";
import { estimateCostUsd } from "./aiCost.js";
import { getClient } from "./supabase.js";

// One row per Claude call: what it was for, which model, tokens, and an
// estimated cost -- so usage can be broken down by feature and by account
// (the Anthropic console only splits by API key). Fire-and-forget: a failed
// log write never fails the call it describes.
export type AiPurpose = "classify_text" | "classify_link" | "classify_image" | "search" | "voice_tag" | "compose" | "tag_cleanup";

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

// Page by page: one read stops at 1,000 rows, which would undercount a busy day.
async function loadSpentSince(sinceIso: string): Promise<number> {
  const PAGE = 1000;
  let total = 0;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await getClient().from("ai_calls").select("cost_usd").gte("created_at", sinceIso).order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(`reading AI spend failed: ${error.message}`);
    for (const row of data ?? []) total += Number(row.cost_usd ?? 0);
    if ((data ?? []).length < PAGE) return total;
  }
}

export const dailyAiBudget = createDailyBudget({ limitUsd: config.aiDailyLimitUsd, loadSpent: loadSpentSince });

export function logAiCall(purpose: AiPurpose, model: string, usage: Usage, userId?: string): void {
  const input = usage.input_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
  const cost = estimateCostUsd(model, input, usage.output_tokens);
  dailyAiBudget.add(cost);
  void Promise.resolve(
    getClient()
      .from("ai_calls")
      .insert({
        user_id: userId ?? null,
        purpose,
        model,
        input_tokens: input,
        output_tokens: usage.output_tokens,
        cost_usd: cost,
      })
  )
    .then(({ error }) => {
      if (error) console.error("logAiCall failed:", error.message);
    })
    .catch((err) => console.error("logAiCall failed:", err));
}
