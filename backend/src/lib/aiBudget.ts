// A ceiling on AI spend across all accounts, per UTC day. Monthly quotas bound
// each person, but guest accounts are free to make, and a retry bug has no
// person to bound. Past the ceiling new memos wait in 미분류함 until the next
// day, the other AI features answer 'ai_unavailable', instead of one bad day
// using up the credit for everyone.
export class AiBudgetExceeded extends Error {
  constructor() {
    super("AI daily limit reached");
  }
}

export function createDailyBudget(opts: { limitUsd: number; loadSpent: (sinceIso: string) => Promise<number>; now?: () => number }) {
  const now = opts.now ?? Date.now;
  let day = "";
  let spent = 0;
  let loaded = false;
  let told = false;

  const today = () => {
    const d = new Date(now()).toISOString().slice(0, 10);
    if (d !== day) {
      day = d;
      spent = 0;
      loaded = false;
      told = false;
    }
    return d;
  };

  const isOver = async (): Promise<boolean> => {
    if (opts.limitUsd <= 0) return false;
    const d = today();
    if (!loaded) {
      // After a restart: what today already cost. A failed read doesn't stop
      // anyone's memos, and the next job asks again.
      try {
        const before = await opts.loadSpent(`${d}T00:00:00.000Z`);
        spent = Math.max(spent, before);
        loaded = true;
      } catch (err) {
        console.error("reading today's AI spend failed:", err);
        return false;
      }
    }
    const over = spent >= opts.limitUsd;
    if (over && !told) {
      told = true;
      console.error(`AI daily limit reached: $${spent.toFixed(2)} of $${opts.limitUsd}. New memos wait in 미분류함 until tomorrow (UTC).`);
    }
    return over;
  };

  return {
    add(costUsd: number) {
      today();
      spent += costUsd;
    },
    isOver,
    // Right before an AI call, so work that waited in line is checked too.
    async assertOpen(): Promise<void> {
      if (await isOver()) throw new AiBudgetExceeded();
    },
  };
}
