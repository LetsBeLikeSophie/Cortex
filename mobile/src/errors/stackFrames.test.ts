// npm test -- nothing the person wrote leaves in an error report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onlyStackFrames } from './stackFrames';

test('the message goes, even one that reads like a frame', () => {
  const stack = [
    'TypeError: my diary says meet Jin at 3pm',
    'at home with Jin',
    'at the clinic (see note)',
    '    at render (address at index.android.bundle:1:5)',
  ].join('\n');
  assert.equal(onlyStackFrames(stack), 'at render (address at index.android.bundle:1:5)');
});

test('an empty stack sends nothing', () => {
  assert.equal(onlyStackFrames(''), '');
});
