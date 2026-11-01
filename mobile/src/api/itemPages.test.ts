// npm test -- '모두' keeps every memo once as it pages back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendPage, mergeFirstPage, updateRows } from './itemPages';

const row = (id: string) => ({ id });

test('a repeated row stays once, in order', () => {
  assert.deepEqual(appendPage([row('a'), row('b')], [row('b'), row('c')]), [row('a'), row('b'), row('c')]);
});

test('a poll updates its rows and keeps the ones paged in further down', () => {
  const list = [{ id: 'a', status: 'pending' }, { id: 'b', status: 'done' }, { id: 'c', status: 'done' }];
  const merged = mergeFirstPage(list, [{ id: 'a', status: 'done' }]);
  assert.deepEqual(merged.map((it) => [it.id, it.status]), [['a', 'done'], ['b', 'done'], ['c', 'done']]);
});

test('a poll puts a new memo on top', () => {
  assert.deepEqual(mergeFirstPage([row('a'), row('b')], [row('n'), row('a')]).map((it) => it.id), ['n', 'a', 'b']);
});

test('a poll with no change gives back the same list', () => {
  const list = [row('a'), row('b'), row('c')];
  assert.equal(mergeFirstPage(list, [{ id: 'a' }, { id: 'b' }]), list);
});

test('a row fetched on its own changes in place', () => {
  const list = [{ id: 'a', status: 'done' }, { id: 'b', status: 'pending' }];
  assert.deepEqual(updateRows(list, [{ id: 'b', status: 'done' }])[1], { id: 'b', status: 'done' });
  assert.equal(updateRows(list, [{ id: 'b', status: 'pending' }]), list);
});

test('a page with nothing new leaves the same length, which ends the paging', () => {
  assert.equal(appendPage([row('a')], [row('a')]).length, 1);
});
