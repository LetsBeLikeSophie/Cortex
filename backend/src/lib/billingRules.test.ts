// npm test -- pro_until after each way a purchase can change.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FOREVER, nextProUntil, PurchaseRow } from "./billingRules.js";

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
];

for (const [name, rows, before, expected] of cases) {
  test(name, () => assert.equal(nextProUntil(rows, before, NOW), expected));
}
