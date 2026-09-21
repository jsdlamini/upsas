import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planChange, migrateSheet, validateDraft, nextCriterionId, describePlan,
  type Instrument, type Draft, type SheetLike,
} from '../src/lib/rubrics/instrument';

const NOW = '2026-09-20T10:00:00Z';

function instrument(): Instrument {
  return {
    versionId: 'rv-p2-1', component: 'p2', version: 1, max: 40,
    title: 'Presentation 2',
    criteria: [
      { id: 'c1', label: 'Methodology', max: 15 },
      { id: 'c2', label: 'Implementation', max: 20 },
      { id: 'c3', label: 'References', max: 5 },
    ],
    locked: false, createdAt: '2025-08-01T08:00:00Z', createdBy: null,
    note: 'Departmental form', supersededBy: null,
  };
}

function draftOf(current: Instrument, over: Partial<Draft> = {}): Draft {
  return {
    title: current.title,
    note: 'Requested by the board of examiners after the 2025 review.',
    criteria: current.criteria.map((c) => ({ id: c.id, label: c.label, max: c.max })),
    ...over,
  };
}

function sheet(over: Partial<SheetLike> = {}): SheetLike & { rubricMax: number } {
  return {
    assessorId: 'a1', studentId: 's1', rubricVersionId: 'rv-p2-1',
    submitted: false, rubricMax: 40, marks: { c1: 12, c2: 18, c3: 4 }, ...over,
  };
}

/* ------------------------------------------------------------- validation */

test('a change needs a reason, and it has to be a sentence', () => {
  const errors = validateDraft(draftOf(instrument(), { note: 'fix' }));
  assert.ok(errors.some((e) => e.includes('why this change is being made')));
});

test('two columns cannot share a heading', () => {
  const current = instrument();
  const errors = validateDraft(draftOf(current, {
    criteria: [
      { id: 'c1', label: 'Methodology', max: 15 },
      { id: 'c2', label: 'methodology', max: 20 },
    ],
  }));
  assert.ok(errors.some((e) => e.includes('Headings must be distinct')));
});

test('a column worth a fraction of a mark is rejected', () => {
  const current = instrument();
  const errors = validateDraft(draftOf(current, {
    criteria: [
      { id: 'c1', label: 'Methodology', max: 7.5 },
      { id: 'c2', label: 'Implementation', max: 20 },
    ],
  }));
  assert.ok(errors.some((e) => e.includes('whole number')));
});

test('a sheet cannot be reduced to a single column', () => {
  const current = instrument();
  const errors = validateDraft(draftOf(current, {
    criteria: [
      { id: 'c1', label: 'Methodology', max: 15 },
      { id: 'c2', label: 'Implementation', max: 20, remove: true },
      { id: 'c3', label: 'References', max: 5, remove: true },
    ],
  }));
  assert.ok(errors.some((e) => e.includes('at least 2 columns')));
});

/* ------------------------------------------------------- the maximum rule */

test('the sheet maximum is the sum of its columns, never a typed number', () => {
  const current = instrument();
  const result = planChange(current, draftOf(current, {
    criteria: [
      { id: 'c1', label: 'Methodology', max: 20 },
      { id: 'c2', label: 'Implementation', max: 25 },
      { id: 'c3', label: 'References', max: 5 },
    ],
  }), [], NOW, 'u-coord');
  assert.ok(result.ok);
  assert.equal(result.plan.next.max, 50);
  assert.equal(result.plan.maxBefore, 40);
});

/* --------------------------------------------------- in place versus fork */

test('an unused form is edited in place — it is still a draft instrument', () => {
  const current = instrument();
  const result = planChange(current, draftOf(current, { title: 'Presentation 2 — Chapters 3 to 5' }),
                            [], NOW, 'u-coord');
  assert.ok(result.ok);
  assert.equal(result.plan.mode, 'in-place');
  assert.equal(result.plan.next.versionId, 'rv-p2-1');
  assert.equal(result.plan.next.version, 1);
});

test('once anything has been marked, an edit forks a new version', () => {
  const current = instrument();
  const result = planChange(current, draftOf(current), [sheet()], NOW, 'u-coord');
  assert.ok(result.ok);
  assert.equal(result.plan.mode, 'fork');
  assert.equal(result.plan.next.versionId, 'rv-p2-2');
  assert.equal(result.plan.next.version, 2);
});

test('a signed sheet is frozen on its own version and acknowledgement is required', () => {
  const current = instrument();
  const result = planChange(current, draftOf(current),
                            [sheet({ submitted: true }), sheet({ assessorId: 'a2' })],
                            NOW, 'u-coord');
  assert.ok(result.ok);
  assert.equal(result.plan.sheetsFrozen, 1);
  assert.equal(result.plan.sheetsMigrated, 1);
  assert.equal(result.plan.requiresAcknowledgement, true);
  assert.deepEqual(result.plan.splitPanels, ['s1']);
});

/* ------------------------------------------------------- marks and ids */

test('renaming a column keeps its id, so marks already entered survive', () => {
  const current = instrument();
  const result = planChange(current, draftOf(current, {
    criteria: [
      { id: 'c1', label: 'Research design', max: 15 },
      { id: 'c2', label: 'Implementation', max: 20 },
      { id: 'c3', label: 'References', max: 5 },
    ],
  }), [sheet()], NOW, 'u-coord');
  assert.ok(result.ok);
  assert.equal(result.plan.next.criteria[0]?.id, 'c1');
  assert.deepEqual(result.plan.renamed, [{ from: 'Methodology', to: 'Research design' }]);
  assert.equal(result.plan.marksCleared.length, 0);

  const open = sheet();
  migrateSheet(open, result.plan.next);
  assert.equal(open.marks['c1'], 12, 'the mark follows the id, not the heading');
});

test('a new column never reuses the id of a removed one', () => {
  const current = instrument();
  const result = planChange(current, draftOf(current, {
    criteria: [
      { id: 'c1', label: 'Methodology', max: 15 },
      { id: 'c2', label: 'Implementation', max: 20 },
      { id: 'c3', label: 'References', max: 5, remove: true },
      { id: null, label: 'Ethics compliance', max: 5 },
    ],
  }), [sheet()], NOW, 'u-coord');
  assert.ok(result.ok);
  const added = result.plan.next.criteria.find((c) => c.label === 'Ethics compliance');
  assert.equal(added?.id, 'c4', 'c3 is retired, not recycled');
});

test('lowering a maximum below an awarded mark blanks it rather than truncating', () => {
  const current = instrument();
  const result = planChange(current, draftOf(current, {
    criteria: [
      { id: 'c1', label: 'Methodology', max: 10 },   // a1 gave 12 here
      { id: 'c2', label: 'Implementation', max: 20 },
      { id: 'c3', label: 'References', max: 5 },
    ],
  }), [sheet()], NOW, 'u-coord');
  assert.ok(result.ok);
  assert.equal(result.plan.marksCleared.length, 1);
  assert.deepEqual(
    { was: result.plan.marksCleared[0]?.was, newMax: result.plan.marksCleared[0]?.newMax },
    { was: 12, newMax: 10 },
  );

  const open = sheet();
  migrateSheet(open, result.plan.next);
  assert.equal(open.marks['c1'], null, 'blank, so the panel excludes it — not 10, which would be a forged judgement');
  assert.equal(open.marks['c2'], 18, 'untouched columns keep their marks');
});

test('removing a column drops its marks and restamps the sheet', () => {
  const current = instrument();
  const result = planChange(current, draftOf(current, {
    criteria: [
      { id: 'c1', label: 'Methodology', max: 15 },
      { id: 'c2', label: 'Implementation', max: 20 },
      { id: 'c3', label: 'References', max: 5, remove: true },
    ],
  }), [sheet()], NOW, 'u-coord');
  assert.ok(result.ok);

  const open = sheet();
  migrateSheet(open, result.plan.next);
  assert.equal('c3' in open.marks, false);
  assert.equal(open.rubricVersionId, 'rv-p2-2');
  assert.equal(open.rubricMax, 35, 'the sheet records the maximum in force when it was marked');
});

/* --------------------------------------------------------------- reporting */

test('a plan describes itself for the version history', () => {
  const current = instrument();
  const result = planChange(current, draftOf(current, {
    criteria: [
      { id: 'c1', label: 'Research design', max: 15 },
      { id: 'c2', label: 'Implementation', max: 25 },
      { id: 'c3', label: 'References', max: 5 },
      { id: null, label: 'Ethics compliance', max: 5 },
    ],
  }), [sheet()], NOW, 'u-coord');
  assert.ok(result.ok);
  const text = describePlan(result.plan);
  assert.match(text, /added Ethics compliance/);
  assert.match(text, /renamed Methodology → Research design/);
  assert.match(text, /total 40 → 50/);
});

test('criterion ids climb past every id ever issued', () => {
  assert.equal(nextCriterionId(['c1', 'c2', 'c9']), 'c10');
  assert.equal(nextCriterionId([]), 'c1');
});
