// npm test -- one metered AI run per person.
import { test } from "node:test";
import assert from "node:assert/strict";
import { withUserLock } from "./userLock.js";

test("a second run while the first is going is turned away", async () => {
  const running = new Set<string>();
  let release!: () => void;
  const first = withUserLock(running, "u1", () => new Promise<string>((r) => (release = () => r("done"))));
  assert.deepEqual(await withUserLock(running, "u1", async () => "again"), { busy: true });
  assert.deepEqual(await withUserLock(running, "u2", async () => "other"), { busy: false, value: "other" });
  release();
  assert.deepEqual(await first, { busy: false, value: "done" });
  assert.deepEqual(await withUserLock(running, "u1", async () => "next"), { busy: false, value: "next" });
});

test("a failed run frees the person", async () => {
  const running = new Set<string>();
  await assert.rejects(withUserLock(running, "u1", async () => { throw new Error("ai down"); }));
  assert.equal(running.has("u1"), false);
});
