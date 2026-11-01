// npm test -- nothing the person wrote reaches app_errors.
import { test } from "node:test";
import assert from "node:assert/strict";
import { onlyStackFrames, safeErrorName } from "./appErrors.js";

test("Hermes and web frames stay", () => {
  const frames = "at handlePress (address at index.android.bundle:1:12345)\nat anonymous (http://localhost:8081/index.bundle:60:21)\nat index.android.bundle:1:99";
  assert.equal(onlyStackFrames(frames), frames);
});

test("the message goes, even one that reads like a frame", () => {
  const stack = [
    "TypeError: my diary says meet Jin at 3pm",
    "at home with Jin",
    "at the clinic (see note)",
    "    at render (address at index.android.bundle:1:5)",
  ].join("\n");
  assert.equal(onlyStackFrames(stack), "at render (address at index.android.bundle:1:5)");
});

test("a long stack is cut", () => {
  const stack = Array.from({ length: 100 }, (_, i) => `at f${i} (index.android.bundle:1:${i})`).join("\n");
  assert.equal(onlyStackFrames(stack).split("\n").length, 30);
});

test("only a plain error class name stays", () => {
  assert.equal(safeErrorName("TypeError"), "TypeError");
  assert.equal(safeErrorName("my diary: Jin"), "Error");
});
