import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCurrent, sectionOf } from '../src/lib/nav/section';

/* ═══════════════════════════════════════════════════ the lit rail item */

test('the rail item follows the page, including sub-pages of a section', () => {
  assert.equal(isCurrent('/grading/p2', '/grading/p1'), true, 'P1 lights "Grade session list" too');
  assert.equal(isCurrent('/book', '/book'), true);
  assert.equal(isCurrent('/book', '/consultations'), false);
  assert.equal(isCurrent('/', '/'), true);
  assert.equal(isCurrent('/', '/book'), false, 'the root does not light for every page');
  assert.equal(isCurrent('/cohort', '/cohort?t=deadlines'), true);
  assert.equal(sectionOf('/rubrics'), 'grading');
});
