// npm test -- the Kakao-unlink purge (decision K1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { purgeEach } from "./purgeEach.js";

test("one account failing doesn't stop the rest", async () => {
  const rows = new Set(["a", "b", "c", "d"]);
  const errors: string[] = [];
  const purged = await purgeEach(
    async (skip) => [...rows].filter((id) => !skip.includes(id)).slice(0, 2),
    async (id) => {
      if (id === "a") throw new Error("storage down");
      rows.delete(id);
    },
    (id) => errors.push(id)
  );
  assert.equal(purged, 3);
  assert.deepEqual([...rows], ["a"]);
  assert.deepEqual(errors, ["a"]);
});
