import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveFlashes, parseErrorList } from '../src/lib/flash';

test('resolveFlashes returns nothing when no flash params are present', () => {
  const result = resolveFlashes({}, {
    saved: { resolve: () => ({ message: 'Saved.', variant: 'success' }) },
    e: { resolve: (p) => ({ message: p.e!, variant: 'error' }) },
  });
  assert.deepEqual(result, { flashes: [], keys: [] });
});

test('resolveFlashes maps saved to a success toast and strips it', () => {
  const result = resolveFlashes({ saved: '1' }, {
    saved: { resolve: () => ({ message: 'Saved.', variant: 'success' }) },
  });
  assert.deepEqual(result, {
    flashes: [{ message: 'Saved.', variant: 'success' }],
    keys: ['saved'],
  });
});

test('resolveFlashes maps e to an error toast with the raw message', () => {
  const result = resolveFlashes({ e: 'Not permitted' }, {
    e: { resolve: (p) => ({ message: p.e!, variant: 'error' }) },
  });
  assert.deepEqual(result, {
    flashes: [{ message: 'Not permitted', variant: 'error' }],
    keys: ['e'],
  });
});

test('resolveFlashes strips companion params like skipped next to added', () => {
  const result = resolveFlashes({ added: '3', skipped: '1' }, {
    added: {
      strip: ['skipped'],
      resolve: (p) => ({
        message: `${p.added} topics added, ${p.skipped} lines skipped.`,
        variant: 'success',
      }),
    },
  });
  assert.deepEqual(result, {
    flashes: [{ message: '3 topics added, 1 lines skipped.', variant: 'success' }],
    keys: ['added', 'skipped'],
  });
});

test('resolveFlashes still strips a trigger whose resolver returns null', () => {
  const result = resolveFlashes({ e: '[]' }, {
    e: { resolve: () => null },
  });
  assert.deepEqual(result, { flashes: [], keys: ['e'] });
});

test('resolveFlashes keeps unrelated params out of the strip set', () => {
  const result = resolveFlashes({ saved: '1', t: 'deadlines' }, {
    saved: { resolve: () => ({ message: 'Saved.', variant: 'success' }) },
  });
  assert.deepEqual(result, {
    flashes: [{ message: 'Saved.', variant: 'success' }],
    keys: ['saved'],
  });
});

test('parseErrorList returns an empty list for a missing value', () => {
  assert.deepEqual(parseErrorList(undefined), []);
});

test('parseErrorList decodes a JSON array of validation errors', () => {
  assert.deepEqual(parseErrorList('["The sheet needs a title.","Say why."]'), [
    'The sheet needs a title.',
    'Say why.',
  ]);
});

test('parseErrorList treats a plain value as a single message', () => {
  assert.deepEqual(parseErrorList('Not permitted'), ['Not permitted']);
});
