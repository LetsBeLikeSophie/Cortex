// npm test -- '모두' keeps every memo once as it pages back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendPage } from './itemPages';

const row = (id: string) => ({ id });

test('a repeated row stays once, in order', () => {
  assert.deepEqual(appendPage([row('a'), row('b')], [row('b'), row('c')]), [row('a'), row('b'), row('c')]);
});

test('a page with nothing new leaves the same length, which ends the paging', () => {
  assert.equal(appendPage([row('a')], [row('a')]).length, 1);
});
