// What a person's purchase rows mean for user_plans.pro_until, with no I/O so
// it can be tested on its own (billingRules.test.ts).

export const FOREVER = "9999-12-31T00:00:00.000Z";

const ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The account a purchase was made from, as Play hands it back. Older purchases
// have none. It comes from the app, so it only ever names who to ask about.
export function buyerAccount(purchase: { obfuscatedExternalAccountId?: string; externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string } }): string | null {
  const id = purchase.obfuscatedExternalAccountId ?? purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId;
  return id && ACCOUNT_ID.test(id) ? id : null;
}

// What stays of Google's answer once the account is gone: enough to answer a
// refund or tax question, nothing that says who it was. A list of what to keep,
// so a field Google adds later doesn't stay by accident.
const KEPT_FIELDS = ["orderId", "latestOrderId", "purchaseTimeMillis", "startTime", "regionCode", "purchaseState", "subscriptionState"];

export function recordOnlyRaw(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const kept: Record<string, unknown> = {};
  for (const field of KEPT_FIELDS) if (source[field] !== undefined) kept[field] = source[field];
  if (Array.isArray(source.lineItems)) {
    kept.lineItems = source.lineItems.map((line: { productId?: unknown; expiryTime?: unknown; latestSuccessfulOrderId?: unknown }) => ({
      productId: line?.productId,
      expiryTime: line?.expiryTime,
      latestSuccessfulOrderId: line?.latestSuccessfulOrderId,
    }));
  }
  return kept;
}

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
