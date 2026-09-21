import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupCommit } from '../src/lib/group-commit';
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

/* ═══════════════════════════════════════════════════ durable acknowledgement */

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

test('a save is acknowledged by a write that started after it, never an earlier one', async () => {
  const writes: Array<{ started: number; gate: ReturnType<typeof deferred> }> = [];
  let clock = 0;
  const commit = groupCommit(async () => {
    const gate = deferred();
    writes.push({ started: ++clock, gate });
    await gate.promise;
    return 'saved';
  });

  const first = commit();                  // starts write 1
  clock += 10;
  const markTypedDuringWrite = commit();   // must NOT be answered by write 1

  writes[0]!.gate.resolve();
  assert.equal(await first, 'saved');
  await new Promise((r) => setImmediate(r));
  assert.equal(writes.length, 2, 'a second write carries the later change');

  let settled = false;
  void markTypedDuringWrite.then(() => { settled = true; });
  await new Promise((r) => setImmediate(r));
  assert.equal(settled, false, 'still waiting: its data is not stored yet');
  writes[1]!.gate.resolve();
  assert.equal(await markTypedDuringWrite, 'saved');
});

test('a burst of saves costs two writes, not one each', async () => {
  let count = 0;
  const gates: Array<() => void> = [];
  const commit = groupCommit(async () => {
    count += 1;
    await new Promise<void>((r) => gates.push(r));
    return 'saved';
  });
  const all = Array.from({ length: 40 }, () => commit());
  gates.shift()!();
  await new Promise((r) => setImmediate(r));
  gates.shift()!();
  await Promise.all(all);
  assert.equal(count, 2);
});

test('a failed write does not strand later callers', async () => {
  let attempt = 0;
  const commit = groupCommit(async () => {
    attempt += 1;
    if (attempt === 1) throw new Error('database blip');
    return 'saved';
  });
  const failing = commit();
  const later = commit();
  await assert.rejects(failing);
  assert.equal(await later, 'saved');
});
