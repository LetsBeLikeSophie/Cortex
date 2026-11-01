// npm test -- who gets the next AI slot.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSlots } from "./slots.js";

test("a new save goes ahead of background work that was already waiting", async () => {
  const withSlot = createSlots(1);
  const order: string[] = [];
  let release = () => {};
  const held = withSlot(() => new Promise<void>((resolve) => (release = resolve)));
  const jobs = [
    withSlot(async () => void order.push("backlog 1"), true),
    withSlot(async () => void order.push("backlog 2"), true),
    withSlot(async () => void order.push("new save")),
  ];
  release();
  await Promise.all([held, ...jobs]);
  assert.deepEqual(order, ["new save", "backlog 1", "backlog 2"]);
});

test("never more than max at once, and a failure frees its slot", async () => {
  const withSlot = createSlots(2);
  let running = 0;
  let peak = 0;
  const work = async () => {
    peak = Math.max(peak, ++running);
    await new Promise((resolve) => setTimeout(resolve, 1));
    running--;
  };
  const failing = withSlot(async () => {
    throw new Error("boom");
  });
  await assert.rejects(failing);
  await Promise.all(Array.from({ length: 6 }, (_, i) => withSlot(work, i % 2 === 0)));
  assert.equal(peak, 2);
});
