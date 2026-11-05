// npm test -- pro_until after each way a purchase can change.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buyerAccount, FOREVER, nextProUntil, PurchaseRow, recordOnlyRaw, subscriptionStatus } from "./billingRules.js";

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
  ["renewing shows the next payment date", [sub("active")], { status: "renewing", until: FUTURE }],
  ["canceled shows when it ends", [sub("canceled")], { status: "ending", until: FUTURE }],
  ["grace says the payment failed, Pro still running", [sub("grace")], { status: "payment_issue", until: FUTURE }],
  ["on hold says the payment failed, no end date", [sub("on_hold", PAST)], { status: "payment_issue", until: null }],
  ["resubscribed after a hold shows the new one", [sub("on_hold", PAST), sub("active")], { status: "renewing", until: FUTURE }],
  ["expired says nothing", [sub("expired", PAST)], null],
  ["refunded says nothing", [sub("refunded")], null],
  ["lifetime", [sub("canceled"), lifetime("active")], { status: "lifetime" }],
  ["after account deletion the rows have no owner, so nothing", [], null],
];

for (const [name, rows, expected] of statusCases) {
  test(`status: ${name}`, () => assert.deepEqual(subscriptionStatus(rows, NOW), expected));
}
