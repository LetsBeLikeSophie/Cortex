// What a person's purchase rows mean for user_plans.pro_until, with no I/O so
// it can be tested on its own (billingRules.test.ts).

export const FOREVER = "9999-12-31T00:00:00.000Z";

export type PurchaseState = "active" | "pending" | "canceled" | "expired" | "refunded";

export interface PurchaseRow {
  kind: string;
  state: PurchaseState;
  expires_at: string | null;
}

// A lifetime pass means "forever", a subscription its current expiry (a
// canceled one still runs to the end of what was paid for). Pro that has ended
// keeps the moment it ended instead of null, whether by refund, revoked
// lifetime or plain expiry (whose notice only comes afterwards), so the free
// share can count from there (decision B2).
export function nextProUntil(rows: PurchaseRow[], before: string | null, nowIso: string): string | null {
  let until: string | null = null;
  for (const row of rows) {
    const candidate =
      row.kind === "lifetime"
        ? row.state === "active"
          ? FOREVER
          : null
        : (row.state === "active" || row.state === "canceled") && row.expires_at
          ? row.expires_at
          : null;
    if (candidate && (!until || candidate > until)) until = candidate;
  }
  if (until && until > nowIso) return until;
  if (!before) return until;
  const ended = before < nowIso ? before : nowIso;
  return until && until > ended ? until : ended;
}
