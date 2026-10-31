import { config } from "../config.js";
import { getClient, logAnalyticsEvent } from "./supabase.js";
import { getEntitlement } from "./plans.js";
import { nextProUntil, type PurchaseRow, type PurchaseState } from "./billingRules.js";
import {
  PlaySubscription,
  acknowledgeProduct,
  acknowledgeSubscription,
  getProductPurchase,
  getSubscription,
  isPurchaseGone,
} from "./googlePlay.js";

// Purchases -> user_plans.pro_until. Every store purchase is a row in
// `purchases` (2026-10-22 migration), checked with the store, and pro_until
// is always recomputed from all of a person's rows (billingRules.ts). The web
// route will write rows the same way, so one field keeps meaning "Pro until".

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

// Purchase rows outlive their account (kept for the records), so an owner may
// be gone. A lookup that fails throws: that's not the same as gone.
async function accountExists(userId: string): Promise<boolean> {
  const { data, error } = await getClient().auth.admin.getUserById(userId);
  if (data?.user) return true;
  if (error && error.status !== 404) throw new Error(`account lookup failed: ${error.message}`);
  return false;
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
  // One purchase, one account -- a token can't be replayed onto another. Once
  // the account that bought it is deleted, it moves to whoever restores it:
  // someone who left and came back still owns what they paid for.
  if (existing && existing.user_id !== userId && (await accountExists(existing.user_id as string))) {
    throw new PurchaseConflictError("purchase belongs to another account");
  }

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
  if (data && (await accountExists(data.user_id as string))) await applyGooglePurchase(data.user_id as string, productId, token);
}

// A deleted account's purchase can still renew or get refunded. Only the row
// changes: there's no plan to recompute, and an error here would have Pub/Sub
// send the notice again for days.
async function recordOrphanPurchase(token: string, productId: string, voided: boolean): Promise<void> {
  const fields: { state: PurchaseState; expires_at?: string | null; raw?: unknown } = { state: "refunded" };
  if (!voided && productId === config.playLifetimeId) {
    const p = await getProductPurchase(productId, token);
    fields.state = p.purchaseState === 0 ? "active" : p.purchaseState === 2 ? "pending" : "canceled";
    fields.raw = p;
  } else if (!voided) {
    const s = await getSubscription(token);
    const { state, expiresAt } = subscriptionState(s);
    Object.assign(fields, { state, expires_at: expiresAt, raw: s });
  }
  const { error } = await getClient().from("purchases").update({ ...fields, updated_at: new Date().toISOString() }).eq("purchase_token", token);
  if (error) throw new Error(`purchase update failed: ${error.message}`);
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
  if (!(await accountExists(data.user_id as string))) {
    await recordOrphanPurchase(token, data.product_id as string, voided);
    return;
  }
  // A voided notice also comes when one past month of a running subscription
  // is refunded, so a subscription follows what Google says about it now.
  if (voided && (data.product_id === config.playLifetimeId || (await subscriptionEnded(token)))) {
    await getClient().from("purchases").update({ state: "refunded", updated_at: new Date().toISOString() }).eq("purchase_token", token);
    await logAnalyticsEvent({ eventType: "purchase_refunded", userId: data.user_id as string, detail: data.product_id as string });
    await recomputeProUntil(data.user_id as string);
    return;
  }
  await applyGooglePurchase(data.user_id as string, data.product_id as string, token);
}

async function subscriptionEnded(token: string): Promise<boolean> {
  try {
    return subscriptionState(await getSubscription(token)).state === "expired";
  } catch (err) {
    if (isPurchaseGone(err)) return true;
    throw err;
  }
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
// opens the app. Google's answer moves it on, so this runs once per lapse. One
// token failing doesn't stop the others, and one Google has forgotten is
// recorded as expired rather than asked about on every refresh.
export async function resyncLapsedPurchases(userId: string): Promise<void> {
  const { data, error } = await getClient()
    .from("purchases")
    .select("purchase_token, state")
    .eq("user_id", userId)
    .eq("kind", "subscription")
    .in("state", ["active", "canceled"])
    .lt("expires_at", new Date().toISOString());
  if (error) throw new Error(`lapsed purchases failed: ${error.message}`);
  for (const row of (data ?? []) as { purchase_token: string; state: PurchaseState }[]) {
    try {
      await refreshGooglePurchase(row.purchase_token);
    } catch (err) {
      if (!isPurchaseGone(err)) {
        console.error("lapsed purchase re-check failed:", err);
        continue;
      }
      try {
        await markExpired(userId, row.purchase_token, row.state);
      } catch (markErr) {
        console.error("marking purchase expired failed:", markErr);
      }
    }
  }
}

async function markExpired(userId: string, token: string, before: PurchaseState): Promise<void> {
  const { error } = await getClient().from("purchases").update({ state: "expired", updated_at: new Date().toISOString() }).eq("purchase_token", token);
  if (error) throw new Error(`purchase update failed: ${error.message}`);
  await logPurchaseChange(userId, before, "expired", "subscription");
  await recomputeProUntil(userId);
}

export async function recomputeProUntil(userId: string): Promise<void> {
  const { data, error } = await getClient().from("purchases").select("kind, state, expires_at").eq("user_id", userId);
  if (error) throw new Error(`recomputeProUntil failed: ${error.message}`);
  // Make sure the plan row exists (it's created lazily), then set it.
  const before = await getEntitlement(userId);
  const until = nextProUntil((data ?? []) as PurchaseRow[], before.proUntil ?? null, new Date().toISOString());
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
