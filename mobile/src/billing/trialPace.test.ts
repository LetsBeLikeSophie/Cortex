// npm test -- the trial-ended pace line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freeRunsOutDay } from './trialPace';

test('saving faster than the free share says the day it runs out', () => {
  assert.equal(freeRunsOutDay(35, 7, 50), 10);
});

test('saving within the free share says nothing', () => {
  assert.equal(freeRunsOutDay(10, 7, 50), null);
});

test('very fast saving runs out on day 1 at the earliest', () => {
  assert.equal(freeRunsOutDay(700, 7, 50), 1);
});

test('nothing saved, nothing to say', () => {
  assert.equal(freeRunsOutDay(0, 7, 50), null);
});
