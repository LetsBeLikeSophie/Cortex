// npm test -- search reading past the first page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scanPages } from "./scanPages.js";

const rows = Array.from({ length: 2500 }, (_, i) => i);
const pager = (seen: number[][]) => (from: number, to: number) => {
  seen.push([from, to]);
  return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
};

test("reads every page to the end", async () => {
  const seen: number[][] = [];
  const kept = await scanPages(pager(seen), (n) => (n % 2 === 0 ? n : undefined));
  assert.equal(kept.length, 1250);
  assert.equal(kept.at(-1), 2498);
  assert.equal(seen.length, 13);
  assert.deepEqual(seen.at(-1), [2400, 2599]);
});

test("stops once there are enough", async () => {
  const seen: number[][] = [];
  const kept = await scanPages(pager(seen), (n) => (n >= 1500 ? n : undefined), (k) => k >= 30);
  assert.equal(kept[0], 1500);
  assert.equal(seen.length, 8);
});

test("an error is thrown, not swallowed", async () => {
  await assert.rejects(
    scanPages(() => Promise.resolve({ data: null, error: { message: "boom" } }), () => 1),
    /boom/
  );
});
