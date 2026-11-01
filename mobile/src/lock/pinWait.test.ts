// npm test -- the wait after wrong PINs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pinWaitMs } from './pinWait';

test('four wrong tries cost nothing, the fifth waits 30 seconds, then it doubles', () => {
  assert.deepEqual([0, 1, 4, 5, 6, 7].map(pinWaitMs), [0, 0, 0, 30_000, 60_000, 120_000]);
});

test('never more than an hour', () => {
  assert.equal(pinWaitMs(12), 3_600_000);
  assert.equal(pinWaitMs(500), 3_600_000);
});
