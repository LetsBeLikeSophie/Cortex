// npm test -- pro_until after each way a purchase can change.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buyerAccount, FOREVER, keepRefunded, needsResync, nextProUntil, PurchaseRow, purchaseFailureDetail, recordOnlyRaw, subscriptionStatus, voidedToRecheck } from "./billingRules.js";

const ACCOUNT = "3f2b8c1e-9a4d-4e7b-8f10-2c6d5e4a1b09";

test("the buyer comes from either kind of Play answer", () => {
  assert.equal(buyerAccount({ obfuscatedExternalAccountId: ACCOUNT }), ACCOUNT);
  assert.equal(buyerAccount({ externalAccountIdentifiers: { obfuscatedExternalAccountId: ACCOUNT } }), ACCOUNT);
});

test("an older purchase, or a value that isn't an account id, names nobody", () => {
  assert.equal(buyerAccount({}), null);
  assert.equal(buyerAccount({ obfuscatedExternalAccountId: "someone@example.com" }), null);
});

test("after deletion only what a refund or tax question needs stays", () => {
  const kept = recordOnlyRaw({
    orderId: "GPA.1",
    latestOrderId: "GPA.2",
    regionCode: "KR",
    obfuscatedExternalAccountId: ACCOUNT,
    externalAccountIdentifiers: { obfuscatedExternalAccountId: ACCOUNT },
    subscribeWithGoogleInfo: { emailAddress: "someone@example.com" },
    lineItems: [{ productId: "cortex_pro", expiryTime: "2026-12-01", offerDetails: { basePlanId: "monthly" } }],
    somethingNew: "x",
  });
  assert.deepEqual(kept, {
    orderId: "GPA.1",
    latestOrderId: "GPA.2",
    regionCode: "KR",
    lineItems: [{ productId: "cortex_pro", expiryTime: "2026-12-01", latestSuccessfulOrderId: undefined }],
  });
  assert.equal(recordOnlyRaw(null), null);
});

test("a test purchase stays marked as one after deletion (it never takes a lifetime pass)", () => {
  assert.deepEqual(recordOnlyRaw({ orderId: "GPA.3", purchaseType: 0, obfuscatedExternalAccountId: ACCOUNT }), { orderId: "GPA.3", purchaseType: 0 });
  assert.deepEqual(recordOnlyRaw({ orderId: "GPA.4", testPurchase: {} }), { orderId: "GPA.4", testPurchase: {} });
});

const NOW = "2026-11-15T00:00:00.000Z";
const PAST = "2026-11-01T00:00:00.000Z";
const EARLIER = "2026-10-01T00:00:00.000Z";
const FUTURE = "2026-12-01T00:00:00.000Z";

const sub = (state: PurchaseRow["state"], expires_at: string | null = FUTURE): PurchaseRow => ({ kind: "subscription", state, expires_at });
const lifetime = (state: PurchaseRow["state"]): PurchaseRow => ({ kind: "lifetime", state, expires_at: null });

const cases: [string, PurchaseRow[], string | null, string | null][] = [
  ["new subscription", [sub("active")], null, FUTURE],
  ["canceled still runs to the end of what was paid", [sub("canceled")], FUTURE, FUTURE],
  ["renewal moves it forward", [sub("active")], PAST, FUTURE],
  ["lifetime beats a subscription", [sub("active"), lifetime("active")], FUTURE, FOREVER],
  ["pending buys nothing", [sub("pending")], null, null],
  ["no purchases, never Pro", [], null, null],
  ["plain expiry keeps when it ended", [sub("expired", PAST)], PAST, PAST],
  ["expiry noticed late, row still says canceled", [sub("canceled", PAST)], PAST, PAST],
  ["refund mid-period ends it now", [sub("refunded")], FUTURE, NOW],
  ["refunded lifetime ends it now", [lifetime("refunded")], FOREVER, NOW],
  ["renewal missed, then lapsed: the later end counts", [sub("canceled", PAST)], EARLIER, PAST],
  ["refund long after it ended doesn't move the end", [sub("refunded")], PAST, PAST],
  ["one sub expired, another still running", [sub("expired", PAST), sub("active")], PAST, FUTURE],
  ["payment failed, Pro runs through the grace period", [sub("grace")], PAST, FUTURE],
  ["on hold ends Pro", [sub("on_hold", PAST)], FUTURE, NOW],
  ["recovered from hold", [sub("active")], PAST, FUTURE],
];

for (const [name, rows, before, expected] of cases) {
  test(name, () => assert.equal(nextProUntil(rows, before, NOW), expected));
}

// The Pro screen's line (decision B1).
const statusCases: [string, PurchaseRow[], ReturnType<typeof subscriptionStatus>][] = [
  ["renewing shows the next payment date", [sub("active")], { status: "renewing", until: FUTURE, plan: null }],
  ["monthly renewing says monthly", [{ ...sub("active"), base_plan: "monthly" }], { status: "renewing", until: FUTURE, plan: "monthly" }],
  ["switched to yearly from the next renewal: yearly, so the offer goes away", [{ ...sub("active"), base_plan: "monthly" }, { ...sub("active", "2027-12-01T00:00:00.000Z"), base_plan: "yearly" }], { status: "renewing", until: "2027-12-01T00:00:00.000Z", plan: "yearly" }],
  ["canceled shows when it ends", [sub("canceled")], { status: "ending", until: FUTURE, plan: null }],
  ["canceled yearly says which plan is ending", [{ ...sub("canceled"), base_plan: "yearly" }], { status: "ending", until: FUTURE, plan: "yearly" }],
  ["grace says the payment failed, Pro still running", [sub("grace")], { status: "payment_issue", until: FUTURE }],
  ["on hold says the payment failed, no end date", [sub("on_hold", PAST)], { status: "payment_issue", until: null }],
  ["resubscribed after a hold shows the new one", [sub("on_hold", PAST), sub("active")], { status: "renewing", until: FUTURE, plan: null }],
  ["expired says nothing", [sub("expired", PAST)], null],
  ["refunded says nothing", [sub("refunded")], null],
  ["lifetime", [sub("canceled"), lifetime("active")], { status: "lifetime" }],
  ["after account deletion the rows have no owner, so nothing", [], null],
];

for (const [name, rows, expected] of statusCases) {
  test(`status: ${name}`, () => assert.deepEqual(subscriptionStatus(rows, NOW), expected));
}

test("resync asks about a running subscription only once its recorded end has passed", () => {
  const now = new Date("2026-11-06T12:00:00Z");
  assert.equal(needsResync({ state: "active", expires_at: "2026-11-06T11:00:00Z", updated_at: "2026-11-01T00:00:00Z" }, now), true);
  assert.equal(needsResync({ state: "active", expires_at: "2026-12-06T11:00:00Z", updated_at: "2026-11-01T00:00:00Z" }, now), false);
  assert.equal(needsResync({ state: "grace", expires_at: "2026-11-05T00:00:00Z", updated_at: null }, now), true);
  assert.equal(needsResync({ state: "canceled", expires_at: null, updated_at: null }, now), false);
});

test("a held payment is re-asked about, but at most every 6 hours", () => {
  const now = new Date("2026-11-06T12:00:00Z");
  // missed its recovery notice: checked again (S-1)
  assert.equal(needsResync({ state: "on_hold", expires_at: "2026-10-01T00:00:00Z", updated_at: "2026-11-06T05:00:00Z" }, now), true);
  // just checked: left alone, so a long hold isn't asked about on every plan fetch
  assert.equal(needsResync({ state: "on_hold", expires_at: "2026-10-01T00:00:00Z", updated_at: "2026-11-06T09:00:00Z" }, now), false);
  assert.equal(needsResync({ state: "on_hold", expires_at: null, updated_at: null }, now), true);
});

test("finished purchases are never re-asked about", () => {
  const now = new Date("2026-11-06T12:00:00Z");
  for (const state of ["expired", "refunded"]) {
    assert.equal(needsResync({ state, expires_at: "2026-10-01T00:00:00Z", updated_at: null }, now), false);
  }
});

test("voided check: a refunded lifetime pass we still hold as active is re-checked", () => {
  assert.deepEqual(voidedToRecheck(["life"], [{ purchase_token: "life", state: "active" }]), ["life"]);
});

test("voided check: one already marked refunded, or a token we never saw, is left alone", () => {
  assert.deepEqual(voidedToRecheck(["done", "unknown"], [{ purchase_token: "done", state: "refunded" }]), []);
});

test("voided check: an expired subscription and a resubscribe's old token are still re-checked once", () => {
  const rows = [
    { purchase_token: "old", state: "expired" },
    { purchase_token: "new", state: "active" },
  ];
  assert.deepEqual(voidedToRecheck(["old", "old"], rows), ["old"]);
});

test("voided check: a deleted account's row (kept for records) is re-checked so it ends refunded", () => {
  // The lookup returns rows regardless of owner; refreshGooglePurchase handles the orphan.
  assert.deepEqual(voidedToRecheck(["orphan"], [{ purchase_token: "orphan", state: "active" }]), ["orphan"]);
});

test("refund: a refunded purchase re-checked as canceled or expired stays refunded", () => {
  assert.equal(keepRefunded("refunded", "canceled"), "refunded");
  assert.equal(keepRefunded("refunded", "expired"), "refunded");
});

test("resubscribing on the same token after a refund makes it live again", () => {
  assert.equal(keepRefunded("refunded", "active"), "active");
  assert.equal(keepRefunded("refunded", "grace"), "grace");
});

test("expiry and other states pass through when there was no refund (also after account deletion: no before)", () => {
  assert.equal(keepRefunded("active", "expired"), "expired");
  assert.equal(keepRefunded(undefined, "canceled"), "canceled");
});

test("a failed purchase step is recorded by status or error class, never its message", () => {
  assert.equal(purchaseFailureDetail("verify:subscription", { status: 400, message: "token abc" }), "verify:subscription:400");
  assert.equal(purchaseFailureDetail("verify:lifetime", new TypeError("boom")), "verify:lifetime:TypeError");
  assert.equal(purchaseFailureDetail("verify", null), "verify:unknown");
});
