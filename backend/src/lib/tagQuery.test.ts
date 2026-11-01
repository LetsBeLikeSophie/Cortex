// npm test -- a home tag tab's query.
import { test } from "node:test";
import assert from "node:assert/strict";
import { newestOfBoth, tagArrayLiteral } from "./tagQuery.js";

test("a tag stays one array element whatever it holds", () => {
  assert.equal(tagArrayLiteral("맛집"), '{"맛집"}');
  assert.equal(tagArrayLiteral("a,b"), '{"a,b"}');
  assert.equal(tagArrayLiteral('a"}b'), '{"a\\"}b"}');
  assert.equal(tagArrayLiteral("a\\b"), '{"a\\\\b"}');
});

test("the newest of both lists, each memo once", () => {
  const row = (id: string, day: number) => ({ id, shared_at: `2026-11-0${day}T00:00:00+00:00` });
  const ai = [row("c", 3), row("a", 1)];
  const mine = [row("d", 4), row("c", 3)];
  assert.deepEqual(newestOfBoth(ai, mine, 2).map((it) => it.id), ["d", "c"]);
  assert.deepEqual(newestOfBoth(ai, mine, 9).map((it) => it.id), ["d", "c", "a"]);
});
