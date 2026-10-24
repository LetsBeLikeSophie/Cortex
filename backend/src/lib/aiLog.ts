import { getClient } from "./supabase.js";

// One row per Claude call: what it was for, which model, tokens, and an
// estimated cost -- so usage can be broken down by feature and by account
// (the Anthropic console only splits by API key). Fire-and-forget: a failed
// log write never fails the call it describes.
export type AiPurpose = "classify_text" | "classify_link" | "classify_image" | "search" | "voice_tag" | "compose" | "tag_cleanup";

// USD per million tokens (input, output). Haiku 5.5's rate for prompts up
// to 100K tokens -- every Cortex call is far below that. Unknown models log
// tokens with a null cost rather than a guess.
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
};

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export function logAiCall(purpose: AiPurpose, model: string, usage: Usage, userId?: string): void {
  const price = PRICES[model];
  const input = usage.input_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
  const cost = price ? (input * price.input + usage.output_tokens * price.output) / 1_000_000 : null;
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
