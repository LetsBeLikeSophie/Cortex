import { config } from "../config.js";
import { getClient, logAnalyticsEvent } from "./supabase.js";
import { getEntitlement } from "./plans.js";
import {
  PlaySubscription,
  acknowledgeProduct,
  acknowledgeSubscription,
  getProductPurchase,
  getSubscription,
} from "./googlePlay.js";

// Purchases -> user_plans.pro_until. Every store purchase is a row in
// `purchases` (2026-10-22 migration), checked with the store, and pro_until
// is always recomputed from all of a person's rows: a lifetime pass means
// "forever", a subscription its current expiry (a canceled one still runs
// to the end of what was paid for). The web route will write rows the
// same way, so one field keeps meaning "Pro until".

const FOREVER = "9999-12-31T00:00:00.000Z";

type PurchaseState = "active" | "pending" | "canceled" | "expired" | "refunded";

export class PurchaseConflictError extends Error {}
export class UnknownProductError extends Error {}

function subscriptionState(s: PlaySubscription): { state: PurchaseState; expiresAt: string | null } {
  const expiresAt =
    (s.lineItems ?? [])
      .map((l) => l.expiryTime)
      .filter((t): t is string => !!t)
      .sort()
      .pop() ?? null;
  switch (s.subscriptionState) {
    case "SUBSCRIPTION_STATE_ACTIVE":
    case "SUBSCRIPTION_STATE_IN_GRACE_PERIOD":
      return { state: "active", expiresAt };
    case "SUBSCRIPTION_STATE_CANCELED":
      // Auto-renew off; access continues until expiresAt.
      return { state: "canceled", expiresAt };
    case "SUBSCRIPTION_STATE_PENDING":
      return { state: "pending", expiresAt };
    default:
      return { state: "expired", expiresAt };
  }
}

async function upsertPurchase(row: {
  user_id: string;
  product_id: string;
  purchase_token: string;
  kind: "subscription" | "lifetime";
  expires_at: string | null;
  state: PurchaseState;
  raw: unknown;
}): Promise<void> {
  const { error } = await getClient()
    .from("purchases")
    .upsert({ ...row, store: "google", updated_at: new Date().toISOString() }, { onConflict: "purchase_token" });
  if (error) throw new Error(`upsertPurchase failed: ${error.message}`);
}

// Checks a Google Play purchase with Google, records it for this account,
// acknowledges it (unacknowledged purchases are refunded after 3 days),
// and recomputes the account's pro_until.
export async function applyGooglePurchase(userId: string, productId: string, token: string): Promise<void> {
  const { data: existing, error } = await getClient()
    .from("purchases")
    .select("user_id, state")
    .eq("purchase_token", token)
    .maybeSingle();
  if (error) throw new Error(`purchase lookup failed: ${error.message}`);
  // One purchase, one account -- a token can't be replayed onto another.
  if (existing && existing.user_id !== userId) throw new PurchaseConflictError("purchase belongs to another account");

  if (productId === config.playLifetimeId) {
    const p = await getProductPurchase(productId, token);
    const state: PurchaseState = p.purchaseState === 0 ? "active" : p.purchaseState === 2 ? "pending" : "canceled";
    await upsertPurchase({ user_id: userId, product_id: productId, purchase_token: token, kind: "lifetime", expires_at: null, state, raw: p });
    await logPurchaseChange(userId, existing?.state as PurchaseState | undefined, state, "lifetime");
    if (state === "active" && p.acknowledgementState === 0) await acknowledgeProduct(productId, token);
  } else if (productId === config.playSubscriptionId) {
    const s = await getSubscription(token);
    const { state, expiresAt } = subscriptionState(s);
    await upsertPurchase({ user_id: userId, product_id: productId, purchase_token: token, kind: "subscription", expires_at: expiresAt, state, raw: s });
    await logPurchaseChange(userId, existing?.state as PurchaseState | undefined, state, s.lineItems?.[0]?.offerDetails?.basePlanId ?? "subscription");
    if (state === "active" && s.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING") {
      await acknowledgeSubscription(productId, token);
    }
  } else {
    throw new UnknownProductError(`unknown product ${productId}`);
  }
  await recomputeProUntil(userId);
}

// Resubscribing or changing plan in the Play Store makes a new token, and the
// old one expires: without this the person pays while Pro ends. The new token
// names the one it replaces, which says whose it is. Anything else unknown (a
// purchase the app hasn't reported yet) waits for the app's verify call.
async function adoptReplacementSubscription(token: string): Promise<void> {
  const s = await getSubscription(token);
  if (!s.linkedPurchaseToken) return;
  const productId = s.lineItems?.[0]?.productId;
  if (productId !== config.playSubscriptionId) return;
  const { data, error } = await getClient().from("purchases").select("user_id").eq("purchase_token", s.linkedPurchaseToken).maybeSingle();
  if (error) throw new Error(`purchase lookup failed: ${error.message}`);
  if (data) await applyGooglePurchase(data.user_id as string, productId, token);
}

// Real-time developer notification: re-check whatever purchase it's about.
export async function refreshGooglePurchase(token: string, voided = false, isSubscription = false): Promise<void> {
  const { data, error } = await getClient()
    .from("purchases")
    .select("user_id, product_id")
    .eq("purchase_token", token)
    .maybeSingle();
  if (error) throw new Error(`purchase lookup failed: ${error.message}`);
  if (!data) {
    if (isSubscription && !voided) await adoptReplacementSubscription(token);
    return;
  }
  if (voided) {
    await getClient().from("purchases").update({ state: "refunded", updated_at: new Date().toISOString() }).eq("purchase_token", token);
    await logAnalyticsEvent({ eventType: "purchase_refunded", userId: data.user_id as string, detail: data.product_id as string });
    await recomputeProUntil(data.user_id as string);
    return;
  }
  await applyGooglePurchase(data.user_id as string, data.product_id as string, token);
}

// What the funnel counts: a state change, not every re-check of the same one.
async function logPurchaseChange(userId: string, before: PurchaseState | undefined, after: PurchaseState, detail: string): Promise<void> {
  if (before === after) return;
  if (after === "active" && before !== "canceled") await logAnalyticsEvent({ eventType: "purchase_done", userId, detail });
  else if (after === "canceled") await logAnalyticsEvent({ eventType: "subscription_canceled", userId, detail });
  else if (after === "expired") await logAnalyticsEvent({ eventType: "subscription_expired", userId, detail });
}

// A renewal notice that never reached us would end Pro for someone who paid:
// a subscription past its recorded end is asked about again when its owner
// opens the app. Google's answer moves it on, so this runs once per lapse.
export async function resyncLapsedPurchases(userId: string): Promise<void> {
  const { data, error } = await getClient()
    .from("purchases")
    .select("purchase_token")
    .eq("user_id", userId)
    .eq("kind", "subscription")
    .in("state", ["active", "canceled"])
    .lt("expires_at", new Date().toISOString());
  if (error) throw new Error(`lapsed purchases failed: ${error.message}`);
  for (const row of (data ?? []) as { purchase_token: string }[]) await refreshGooglePurchase(row.purchase_token);
}

export async function recomputeProUntil(userId: string): Promise<void> {
  const { data, error } = await getClient().from("purchases").select("kind, state, expires_at").eq("user_id", userId);
  if (error) throw new Error(`recomputeProUntil failed: ${error.message}`);
  let until: string | null = null;
  for (const row of (data ?? []) as { kind: string; state: PurchaseState; expires_at: string | null }[]) {
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
  // Make sure the plan row exists (it's created lazily), then set it.
  const before = await getEntitlement(userId);
  // Pro ending early (refund, revoked lifetime) keeps the moment it ended
  // instead of null, so the free share can count from there (decision B2).
  const nowIso = new Date().toISOString();
  if (before.proUntil && before.proUntil > nowIso && (!until || until < nowIso)) until = nowIso;
  const { error: updateError } = await getClient().from("user_plans").update({ pro_until: until }).eq("user_id", userId);
  if (updateError) throw new Error(`pro_until update failed: ${updateError.message}`);
}

// Lifetime passes are for the first `lifetimeCap` buyers; the app hides the
// option once none are left.
export async function lifetimeRemaining(): Promise<number> {
  const { count, error } = await getClient()
    .from("purchases")
    .select("id", { count: "exact", head: true })
    .eq("kind", "lifetime")
    .in("state", ["active", "pending"]);
  if (error) throw new Error(`lifetimeRemaining failed: ${error.message}`);
  return Math.max(0, config.lifetimeCap - (count ?? 0));
}
