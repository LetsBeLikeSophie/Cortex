// npm test -- Mehh screenshot AI: who is Pro, the monthly cap, the answer mapping.
import { test } from "node:test";
import assert from "node:assert/strict";
import { coinsNow, integrityProblem, isMehhPro, photosGranted, resultsFor } from "./mehhRules.js";

test("a bought lifetime pass counts; a refunded or pending one does not", () => {
  assert.equal(isMehhPro({ purchaseState: 0 }), true);
  assert.equal(isMehhPro({ purchaseState: 1 }), false); // refund / cancel
  assert.equal(isMehhPro({ purchaseState: 2 }), false); // pending payment
});

test("3-month Pro counts for 90 days from its purchase time, not after, not refunded", () => {
  const day = 24 * 60 * 60 * 1000;
  const at = Date.UTC(2026, 10, 14);
  const bought = { purchaseState: 0, purchaseTimeMillis: String(at) };
  assert.equal(isMehhPro(bought, "trial", at + 89 * day), true);
  assert.equal(isMehhPro(bought, "trial", at + 90 * day), false);
  assert.equal(isMehhPro({ ...bought, purchaseState: 1 }, "trial", at + day), false);
  assert.equal(isMehhPro({ purchaseState: 0 }, "trial", at), false); // no purchase time
  assert.equal(isMehhPro(bought, "lifetime", at + 400 * day), true); // the lifetime pass never ends
});

test("the cap lets through what is left of the month, never more", () => {
  assert.equal(photosGranted(10, 0, 300), 10);
  assert.equal(photosGranted(10, 295, 300), 5);
  assert.equal(photosGranted(10, 300, 300), 0);
  assert.equal(photosGranted(10, 310, 300), 0); // limit lowered mid-month
});

test("answers map back by position; gaps and made-up labels become unsure", () => {
  const out = resultsFor(
    ["a", "b", "c", "d"],
    [
      { index: 0, verdict: "useless", reason: "used_code" },
      { index: 0, verdict: "keep", reason: "note" }, // repeated: first wins
      { index: 2, verdict: "delete_now", reason: "receipt" }, // unknown verdict
      { index: 9, verdict: "useless", reason: "other" }, // not in the batch
    ]
  );
  assert.deepEqual(out, [
    { id: "a", verdict: "useless", reason: "used_code" },
    { id: "b", verdict: "unsure", reason: "other" },
    { id: "c", verdict: "unsure", reason: "other" },
    { id: "d", verdict: "unsure", reason: "other" },
  ]);
});

test("a person in the picture is always kept", () => {
  const [r] = resultsFor(["a"], [{ index: 0, verdict: "useless", reason: "person" }]);
  assert.deepEqual(r, { id: "a", verdict: "keep", reason: "person" });
});

test("free coins: 3 to start, one more a month, never past 3", () => {
  assert.equal(coinsNow(0, "2026-11", "2026-11"), 0); // same month: no refill
  assert.equal(coinsNow(0, "2026-11", "2026-12"), 1);
  assert.equal(coinsNow(2, "2026-11", "2026-12"), 3);
  assert.equal(coinsNow(3, "2026-11", "2026-12"), 3); // full stays full
  assert.equal(coinsNow(0, "2026-11", "2027-02"), 3); // 3 months away, capped
  assert.equal(coinsNow(1, "2026-12", "2027-01"), 2); // across a year
});

test("integrity: only a fresh, licensed Play build of Mehh on a real device with this request hash", () => {
  const now = 1_800_000_000_000;
  const good = {
    requestDetails: { requestPackageName: "dev.itssophie.mehh", requestHash: "h", timestampMillis: String(now - 1000) },
    appIntegrity: { appRecognitionVerdict: "PLAY_RECOGNIZED" },
    deviceIntegrity: { deviceRecognitionVerdict: ["MEETS_DEVICE_INTEGRITY"] },
    accountDetails: { appLicensingVerdict: "LICENSED" },
  };
  const want = { packageName: "dev.itssophie.mehh", requestHash: "h", now };
  assert.equal(integrityProblem(good, want), null);
  assert.equal(integrityProblem({ ...good, requestDetails: { ...good.requestDetails, requestPackageName: "x.y" } }, want), "package");
  assert.equal(integrityProblem(good, { ...want, requestHash: "other" }), "request_hash");
  assert.equal(integrityProblem(good, { ...want, now: now + 11 * 60 * 1000 }), "stale");
  assert.equal(integrityProblem({ ...good, accountDetails: { appLicensingVerdict: "UNLICENSED" } }, want), "unlicensed");
  assert.equal(integrityProblem({ ...good, appIntegrity: { appRecognitionVerdict: "UNRECOGNIZED_VERSION" } }, want), "app");
  assert.equal(integrityProblem({ ...good, deviceIntegrity: { deviceRecognitionVerdict: [] } }, want), "device"); // emulator
  assert.equal(integrityProblem({}, want), "package");
});
