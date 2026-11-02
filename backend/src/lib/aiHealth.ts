// What GET /health/ai reports to the outside monitor (decision M1): whether
// the Claude API last refused for a reason retrying won't fix (credit ran
// out, key rejected) and hasn't answered since. Kept in memory: a restart
// starts healthy, and the next refused call marks it again.
let lastRefusedAt = 0;
let lastAnsweredAt = 0;

export function noteAiAnswered(now = Date.now()): void {
  lastAnsweredAt = now;
}

export function noteAiRefused(now = Date.now()): void {
  lastRefusedAt = now;
}

export function aiRefusing(): boolean {
  return lastRefusedAt > lastAnsweredAt;
}
