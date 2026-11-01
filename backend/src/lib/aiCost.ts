// USD per million tokens (input, output). Haiku 5.5's rate for prompts up
// to 100K tokens -- every Cortex call is far below that.
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
};

// A model missing from the table counts at the table's dearest rate: costing
// nothing would quietly switch off the daily ceiling.
const DEAREST = Object.values(PRICES).reduce((a, b) => (b.input > a.input ? b : a));

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICES[model] ?? DEAREST;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
