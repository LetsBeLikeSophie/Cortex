import assert from "node:assert/strict";
import { test } from "node:test";

import { canLockAnotherTag, tagLockChange } from "./tagLock.js";

test("free locks one tag, pro and trial any number", () => {
  assert.equal(canLockAnotherTag("free", 0), true);
  assert.equal(canLockAnotherTag("free", 1), false);
  assert.equal(canLockAnotherTag("trial", 5), true);
  assert.equal(canLockAnotherTag("pro", 5), true);
});

test("a memo in a locked tag gets locked by the tag", () => {
  assert.deepEqual(tagLockChange({ tags: ["a"], user_tags: [] }, ["a"]), { locked: true, locked_by_tag: true });
  assert.deepEqual(tagLockChange({ tags: [], user_tags: ["a"] }, ["a"]), { locked: true, locked_by_tag: true });
});

test("leaving the last locked tag opens a memo the tag locked", () => {
  assert.deepEqual(tagLockChange({ tags: ["b"], user_tags: [], locked: true, locked_by_tag: true }, ["a"]), { locked: false, locked_by_tag: false });
});

test("a memo locked by hand stays locked", () => {
  assert.equal(tagLockChange({ tags: ["b"], user_tags: [], locked: true, locked_by_tag: false }, []), null);
  assert.equal(tagLockChange({ tags: ["a"], user_tags: [], locked: true, locked_by_tag: false }, ["a"]), null);
});

test("nothing to change", () => {
  assert.equal(tagLockChange({ tags: ["b"], user_tags: [] }, ["a"]), null);
  assert.equal(tagLockChange({ tags: ["a"], user_tags: [], locked: true, locked_by_tag: true }, ["a"]), null);
});
