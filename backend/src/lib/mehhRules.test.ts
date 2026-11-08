// npm test -- Mehh screenshot AI: who is Pro, the monthly cap, the answer mapping.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isMehhPro, photosGranted, resultsFor } from "./mehhRules.js";

test("a bought lifetime pass counts; a refunded or pending one does not", () => {
  assert.equal(isMehhPro({ purchaseState: 0 }), true);
  assert.equal(isMehhPro({ purchaseState: 1 }), false); // refund / cancel
  assert.equal(isMehhPro({ purchaseState: 2 }), false); // pending payment
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
