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
// purchaseType / testPurchase mark a license tester's purchase (no money),
// which never takes one of the first-100 lifetime passes.
const KEPT_FIELDS = ["orderId", "latestOrderId", "purchaseTimeMillis", "startTime", "regionCode", "purchaseState", "subscriptionState", "purchaseType", "testPurchase"];

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

// grace: a renewal payment failed, Pro continues while Play retries.
// on_hold: retries ran out, Pro is off until the payment is fixed (decision B1).
export type PurchaseState = "active" | "grace" | "on_hold" | "pending" | "canceled" | "expired" | "refunded";

export interface PurchaseRow {
  kind: string;
  state: PurchaseState;
  expires_at: string | null;
  // Play's base plan ("monthly", "yearly") for a subscription, when known.
  base_plan?: string | null;
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
        : (row.state === "active" || row.state === "grace" || row.state === "canceled") && row.expires_at
          ? row.expires_at
          : null;
    if (candidate && (!until || candidate > until)) until = candidate;
  }
  if (until && until > nowIso) return until;
  if (!before) return until;
  const ended = before < nowIso ? before : nowIso;
  return until && until > ended ? until : ended;
}

// The one line the Pro screen shows about a person's purchase: renews on a
// date, ends on a date, or a payment that didn't go through (decision B1).
// A running purchase wins over a stuck one, so resubscribing after a hold
// shows the new subscription.
export type SubscriptionStatus =
  | { status: "lifetime" }
  | { status: "renewing"; until: string; plan: string | null }
  | { status: "ending"; until: string; plan: string | null }
  | { status: "payment_issue"; until: string | null };

export function subscriptionStatus(rows: PurchaseRow[], nowIso: string): SubscriptionStatus | null {
  if (rows.some((r) => r.kind === "lifetime" && r.state === "active")) return { status: "lifetime" };
  const subs = rows.filter((r) => r.kind !== "lifetime");
  const latest = (state: PurchaseState) =>
    subs
      .filter((r) => r.state === state)
      .map((r) => r.expires_at)
      .sort()
      .pop();
  const active = latest("active");
  // Yearly once any running row is yearly: a switch from monthly waits for the
  // next renewal with both tokens active (decision B2), and asks only once.
  const running = subs.filter((r) => r.state === "active" && r.expires_at && r.expires_at > nowIso);
  const plan = running.some((r) => r.base_plan === "yearly") ? "yearly" : (running[0]?.base_plan ?? null);
  if (active && active > nowIso) return { status: "renewing", until: active, plan };
  const grace = latest("grace");
  if (grace !== undefined) return { status: "payment_issue", until: grace && grace > nowIso ? grace : null };
  const ending = latest("canceled");
  if (ending && ending > nowIso) {
    // Which plan is ending, so the Pro screen can show it as the current one.
    const endingPlan = subs.find((r) => r.state === "canceled" && r.expires_at === ending)?.base_plan ?? null;
    return { status: "ending", until: ending, plan: endingPlan };
  }
  if (subs.some((r) => r.state === "on_hold")) return { status: "payment_issue", until: null };
  return null;
}

// Which of a person's subscription rows to ask Google about again when they
// open the app (resyncLapsedPurchases): a running state past its recorded end
// (a missed renewal notice), and a held payment (on_hold) not re-checked for
// 6 hours -- missing its recovery notice must not leave Pro off, or a lapsed
// hold block buying again, for good. The 6 hours keep a long hold from being
// asked about on every plan fetch.
export const ON_HOLD_RECHECK_MS = 6 * 60 * 60 * 1000;
export function needsResync(row: { state: string; expires_at: string | null; updated_at: string | null }, now: Date): boolean {
  const nowIso = now.toISOString();
  if (row.state === "on_hold") return !row.updated_at || row.updated_at < new Date(now.getTime() - ON_HOLD_RECHECK_MS).toISOString();
  return ["active", "grace", "canceled"].includes(row.state) && !!row.expires_at && row.expires_at < nowIso;
}

// The daily voided-purchase check (a refund notice that never arrived): of the
// tokens Google lists as voided, the ones we hold a row for that isn't marked
// refunded yet. A row whose account was deleted (user_id null) is included too,
// so its record still ends up refunded. Unknown tokens are skipped: nothing of
// ours to change.
export function voidedToRecheck(voidedTokens: string[], rows: { purchase_token: string; state: string }[]): string[] {
  const open = new Set(rows.filter((r) => r.state !== "refunded").map((r) => r.purchase_token));
  return [...new Set(voidedTokens)].filter((t) => open.has(t));
}
