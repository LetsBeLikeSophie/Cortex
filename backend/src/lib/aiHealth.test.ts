// npm test -- what /health/ai tells the monitor.
import { test } from "node:test";
import assert from "node:assert/strict";
import { aiRefusing, noteAiAnswered, noteAiRefused } from "./aiHealth.js";

test("refused until Claude answers again", () => {
  assert.equal(aiRefusing(), false);
  noteAiRefused(1000);
  assert.equal(aiRefusing(), true);
  noteAiAnswered(2000);
  assert.equal(aiRefusing(), false);
});
