import { config } from "../config.js";
import { getClient, logAnalyticsEvent } from "./supabase.js";
import { getEntitlement } from "./plans.js";
import { buyerAccount, keepRefunded, needsResync, nextProUntil, recordOnlyRaw, voidedToRecheck, type PurchaseRow, type PurchaseState } from "./billingRules.js";
import {
  PlaySubscription,
  acknowledgeProduct,
  acknowledgeSubscription,
  getProductPurchase,
  getSubscription,
  isPurchaseGone,
  listVoidedPurchases,
  PlayApiError,
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
      return { state: "active", expiresAt };
    case "SUBSCRIPTION_STATE_IN_GRACE_PERIOD":
      return { state: "grace", expiresAt };
    case "SUBSCRIPTION_STATE_ON_HOLD":
      return { state: "on_hold", expiresAt };
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

// Purchase rows outlive their account (kept for the records, with no owner), so
// an owner may be gone. A lookup that fails throws: that's not the same as gone.
async function accountExists(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await getClient().auth.admin.getUserById(userId);
  if (data?.user) return true;
  if (error && error.status !== 404) throw new Error(`account lookup failed: ${error.message}`);
  return false;
}

type PurchaseInsert = Parameters<typeof upsertPurchase>[0];

// The app's verify and Google's purchase notice arrive within milliseconds of
// each other (Sophie 11-11), and both saw no row. Only the one whose insert
// lands counts the purchase as new; the other just updates it.
async function claimNew(row: PurchaseInsert): Promise<boolean> {
  const { data, error } = await getClient()
    .from("purchases")
    .upsert({ ...row, store: "google", updated_at: new Date().toISOString() }, { onConflict: "purchase_token", ignoreDuplicates: true })
    .select("purchase_token");
  if (error) throw new Error(`claimNew failed: ${error.message}`);
  return (data ?? []).length > 0;
}

// Acknowledge, unless the other of those two calls already did: Play refuses a
// second acknowledgement, which used to fail the app's verify after Pro was on.
async function acknowledgeOnce(ack: () => Promise<unknown>, acknowledged: () => Promise<boolean>): Promise<void> {
  try {
    await ack();
  } catch (err) {
    if (err instanceof PlayApiError && err.status < 500 && (await acknowledged())) return;
    throw err;
  }
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
  if (existing && existing.user_id !== userId && (await accountExists(existing.user_id as string | null))) {
    throw new PurchaseConflictError("purchase belongs to another account");
  }

  if (productId === config.playLifetimeId) {
    const p = await getProductPurchase(productId, token);
    if (existing?.user_id !== userId) await refuseIfBoughtByAnother(buyerAccount(p), userId);
    const before = existing?.state as PurchaseState | undefined;
    const state = keepRefunded(before, p.purchaseState === 0 ? "active" : p.purchaseState === 2 ? "pending" : "canceled");
    const row: PurchaseInsert = { user_id: userId, product_id: productId, purchase_token: token, kind: "lifetime", expires_at: null, state, raw: p };
    const isNew = !existing && (await claimNew(row));
    await upsertPurchase(row);
    await logPurchaseChange(userId, existing || isNew ? before : state, state, "lifetime");
    if (state === "active" && p.acknowledgementState === 0) {
      await acknowledgeOnce(
        () => acknowledgeProduct(productId, token),
        async () => (await getProductPurchase(productId, token)).acknowledgementState === 1
      );
    }
  } else if (productId === config.playSubscriptionId) {
    const s = await getSubscription(token);
    if (existing?.user_id !== userId) await refuseIfBoughtByAnother(buyerAccount(s), userId);
    const before = existing?.state as PurchaseState | undefined;
    const fresh = subscriptionState(s);
    const state = keepRefunded(before, fresh.state);
    const row: PurchaseInsert = { user_id: userId, product_id: productId, purchase_token: token, kind: "subscription", expires_at: fresh.expiresAt, state, raw: s };
    const isNew = !existing && (await claimNew(row));
    await upsertPurchase(row);
    // Lost the race to the other call: it already counted this purchase.
    await logPurchaseChange(userId, existing || isNew ? before : state, state, s.lineItems?.[0]?.offerDetails?.basePlanId ?? "subscription");
    if (state === "active" && s.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING") {
      await acknowledgeOnce(
        () => acknowledgeSubscription(productId, token),
        async () => (await getSubscription(token)).acknowledgementState === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED"
      );
    }
  } else {
    throw new UnknownProductError(`unknown product ${productId}`);
  }
  await recomputeProUntil(userId);
}

// Bought on one account, then the app was opened on another: it stays with the
// buyer, unless that account is gone.
async function refuseIfBoughtByAnother(buyer: string | null, userId: string): Promise<void> {
  if (buyer && buyer !== userId && (await accountExists(buyer))) throw new PurchaseConflictError("purchase belongs to another account");
}

// A notice about a token we haven't seen. Paid, but the app never reported it
// (no signal, never opened again), or a resubscribe or plan change in the Play
// Store, which makes a new token while the old one expires. Either way the
// purchase says whose it is: the token it replaces, or the account the app sent.
// Without this the person pays and Pro stays off, then Play refunds after 3 days.
async function adoptSubscription(token: string): Promise<void> {
  const s = await getSubscription(token);
  const productId = s.lineItems?.[0]?.productId;
  if (productId !== config.playSubscriptionId) return;
  let owner = buyerAccount(s);
  if (s.linkedPurchaseToken) {
    const { data, error } = await getClient().from("purchases").select("user_id").eq("purchase_token", s.linkedPurchaseToken).maybeSingle();
    if (error) throw new Error(`purchase lookup failed: ${error.message}`);
    owner = (data?.user_id as string | null | undefined) ?? owner;
  }
  if (owner && (await accountExists(owner))) await applyGooglePurchase(owner, productId, token);
}

async function adoptLifetime(productId: string, token: string): Promise<void> {
  const owner = buyerAccount(await getProductPurchase(productId, token));
  if (owner && (await accountExists(owner))) await applyGooglePurchase(owner, productId, token);
}

// A deleted account's purchase can still renew or get refunded. Only the row
// changes: there's no plan to recompute, and an error here would have Pub/Sub
// send the notice again for days.
async function recordOrphanPurchase(token: string, productId: string, voided: boolean): Promise<void> {
  const fields: { state: PurchaseState; expires_at?: string | null; raw?: unknown } = { state: "refunded" };
  if (!voided && productId === config.playLifetimeId) {
    const p = await getProductPurchase(productId, token);
    fields.state = p.purchaseState === 0 ? "active" : p.purchaseState === 2 ? "pending" : "canceled";
    fields.raw = recordOnlyRaw(p);
  } else if (!voided) {
    const s = await getSubscription(token);
    const { state, expiresAt } = subscriptionState(s);
    Object.assign(fields, { state, expires_at: expiresAt, raw: recordOnlyRaw(s) });
  }
  const { error } = await getClient().from("purchases").update({ ...fields, updated_at: new Date().toISOString() }).eq("purchase_token", token);
  if (error) throw new Error(`purchase update failed: ${error.message}`);
}

// Real-time developer notification: re-check whatever purchase it's about.
export async function refreshGooglePurchase(token: string, voided = false, isSubscription = false, sku?: string): Promise<void> {
  const { data, error } = await getClient()
    .from("purchases")
    .select("user_id, product_id")
    .eq("purchase_token", token)
    .maybeSingle();
  if (error) throw new Error(`purchase lookup failed: ${error.message}`);
  if (!data) {
    if (voided) return;
    if (isSubscription) await adoptSubscription(token);
    else if (sku === config.playLifetimeId) await adoptLifetime(sku, token);
    return;
  }
  if (!(await accountExists(data.user_id as string | null))) {
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
  // Back from a held payment or an undone cancel is the same purchase, not a new one.
  if (after === "active" && before !== "canceled" && before !== "grace" && before !== "on_hold") await logAnalyticsEvent({ eventType: "purchase_done", userId, detail });
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
    .select("purchase_token, state, expires_at, updated_at")
    .eq("user_id", userId)
    .eq("kind", "subscription")
    .in("state", ["active", "grace", "canceled", "on_hold"]);
  if (error) throw new Error(`lapsed purchases failed: ${error.message}`);
  const now = new Date();
  type Row = { purchase_token: string; state: PurchaseState; expires_at: string | null; updated_at: string | null };
  // Which ones, and why on_hold is included only every 6 hours: needsResync.
  for (const row of ((data ?? []) as Row[]).filter((r) => needsResync(r, now))) {
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

// Backstop for a refund notice (RTDN) that never reached us: once a day, ask
// Google for everything voided in the last 30 days (the most it keeps) and
// handle each one we still hold as not refunded the way the notice would have.
// Pages to the end; a page cap guards against a token that never ends. One
// purchase failing doesn't stop the others.
const VOIDED_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const VOIDED_MAX_PAGES = 50;
const LOOKUP_CHUNK = 50;

export async function syncVoidedPurchases(now = Date.now()): Promise<number> {
  const tokens: string[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < VOIDED_MAX_PAGES; page++) {
    const res = await listVoidedPurchases(now - VOIDED_WINDOW_MS, pageToken);
    for (const v of res.voidedPurchases ?? []) if (v.purchaseToken) tokens.push(v.purchaseToken);
    pageToken = res.tokenPagination?.nextPageToken;
    if (!pageToken) break;
  }
  let handled = 0;
  for (let i = 0; i < tokens.length; i += LOOKUP_CHUNK) {
    const chunk = tokens.slice(i, i + LOOKUP_CHUNK);
    const { data, error } = await getClient().from("purchases").select("purchase_token, state").in("purchase_token", chunk).neq("state", "refunded");
    if (error) throw new Error(`voided lookup failed: ${error.message}`);
    for (const token of voidedToRecheck(chunk, (data ?? []) as { purchase_token: string; state: string }[])) {
      try {
        await refreshGooglePurchase(token, true);
        handled++;
      } catch (err) {
        console.error("voided purchase re-check failed:", err);
      }
    }
  }
  return handled;
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
// option once none are left. A license tester's purchase (Play's
// purchaseType 0, no money changes hands) doesn't take a pass.
export async function lifetimeRemaining(): Promise<number> {
  const { count, error } = await getClient()
    .from("purchases")
    .select("id", { count: "exact", head: true })
    .eq("kind", "lifetime")
    .in("state", ["active", "pending"])
    .or("raw->>purchaseType.is.null,raw->>purchaseType.neq.0");
  if (error) throw new Error(`lifetimeRemaining failed: ${error.message}`);
  return Math.max(0, config.lifetimeCap - (count ?? 0));
}
