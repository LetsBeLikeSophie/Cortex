// npm test -- the service-wide AI spend ceiling.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AiBudgetExceeded, createDailyBudget } from "./aiBudget.js";
import { estimateCostUsd } from "./aiCost.js";
import { createSlots } from "./slots.js";

const DAY = 24 * 60 * 60 * 1000;
const START = Date.parse("2026-11-01T10:00:00Z");

test("a job waiting for a slot is checked when its turn comes", async () => {
  const b = createDailyBudget({ limitUsd: 5, loadSpent: async () => 0, now: () => START });
  const withSlot = createSlots(1);
  let release = () => {};
  const held = withSlot(() => new Promise<void>((resolve) => (release = resolve)));
  let called = false;
  const waiting = withSlot(async () => {
    await b.assertOpen();
    called = true;
  });
  b.add(5);
  release();
  await held;
  await assert.rejects(waiting, AiBudgetExceeded);
  assert.equal(called, false);
});

test("a model missing from the price table still counts, at the dearest rate", () => {
  assert.equal(estimateCostUsd("claude-haiku-5-5", 1_000_000, 0), 0.1);
  assert.equal(estimateCostUsd("some-new-model", 1_000_000, 1_000_000), 6);
});

test("stops at the limit and opens again the next day", async () => {
  let clock = START;
  const b = createDailyBudget({ limitUsd: 5, loadSpent: async () => 0, now: () => clock });
  assert.equal(await b.isOver(), false);
  b.add(4.99);
  assert.equal(await b.isOver(), false);
  b.add(0.01);
  assert.equal(await b.isOver(), true);
  clock += DAY;
  assert.equal(await b.isOver(), false);
});

test("a restart picks up what today already cost, once per day", async () => {
  let clock = START;
  const asked: string[] = [];
  const b = createDailyBudget({
    limitUsd: 5,
    loadSpent: async (since) => {
      asked.push(since);
      return 6;
    },
    now: () => clock,
  });
  assert.equal(await b.isOver(), true);
  assert.equal(await b.isOver(), true);
  assert.deepEqual(asked, ["2026-11-01T00:00:00.000Z"]);
  clock += DAY;
  await b.isOver();
  assert.deepEqual(asked, ["2026-11-01T00:00:00.000Z", "2026-11-02T00:00:00.000Z"]);
});

test("a failed read lets memos through and asks again", async () => {
  let fail = true;
  let reads = 0;
  const b = createDailyBudget({
    limitUsd: 5,
    loadSpent: async () => {
      reads++;
      if (fail) throw new Error("db down");
      return 7;
    },
    now: () => START,
  });
  assert.equal(await b.isOver(), false);
  fail = false;
  assert.equal(await b.isOver(), true);
  assert.equal(reads, 2);
});

test("limit 0 turns it off", async () => {
  const b = createDailyBudget({ limitUsd: 0, loadSpent: async () => 100, now: () => START });
  b.add(100);
  assert.equal(await b.isOver(), false);
});
