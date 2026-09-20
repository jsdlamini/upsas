import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PROFILE_A, PROFILE_B, validateConfig, computeFinalMark,
  evaluateConsultations, aggregatePanel, normalisePercentage, roundHalfUp,
  type AssessorEntry, type ConsultationRecord, type AssessmentConfig,
} from '../src/lib/assessment/index';

/* ------------------------------------------------------------------ helpers */

const P1_MAXIMA = [5, 5, 5, 5, 5, 5, 5, 2, 3]; // total 40
const P2_MAXIMA = [5, 5, 5, 15, 25, 10, 5, 5, 5]; // total 80

/** Distribute a target total across criteria without exceeding any maximum. */
function distribute(total: number, maxima: number[]): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  let left = total;
  maxima.forEach((max, i) => {
    const take = Math.min(max, left);
    out[`c${i + 1}`] = take;
    left -= take;
  });
  assert.equal(left, 0, `cannot distribute ${total} across ${maxima.join('+')}`);
  return out;
}

function entry(
  assessorId: string, total: number, maxima: number[], rubricVersionId: string,
  opts: Partial<AssessorEntry> = {},
): AssessorEntry {
  return {
    assessorId,
    rubricVersionId,
    rubricMax: maxima.reduce((a, b) => a + b, 0),
    criterionScores: distribute(total, maxima),
    submitted: true,
    ...opts,
  };
}

function consult(periodId: string, score: number | null, id: string): ConsultationRecord {
  return { id, periodId, status: 'COMPLETED', supervisorAttested: true, studentAttested: true, score };
}

/** Panel totals chosen so the mean lands exactly on the fixture percentage. */
const P1_PANEL = [
  entry('a1', 28, P1_MAXIMA, 'rv-p1-1'),
  entry('a2', 29, P1_MAXIMA, 'rv-p1-1'),
  entry('a3', 30, P1_MAXIMA, 'rv-p1-1'),
]; // 70 + 72.5 + 75 → 72.5%

const P2_PANEL = [
  entry('a1', 60, P2_MAXIMA, 'rv-p2-1'),
  entry('a2', 62, P2_MAXIMA, 'rv-p2-1'),
  entry('a3', 64, P2_MAXIMA, 'rv-p2-1'),
]; // 75 + 77.5 + 80 → 77.5%

/* ------------------------------------------------ normalisation and rounding */

test('normalisation: identical performance on different rubric maxima is equal', () => {
  assert.equal(normalisePercentage(29, 40), 72.5);
  assert.equal(normalisePercentage(58, 80), 72.5);
  assert.notEqual(29, 58); // raw totals are NOT comparable — this is the point
});

test('normalisation rejects an out-of-range or zero-maximum score', () => {
  assert.throws(() => normalisePercentage(41, 40), RangeError);
  assert.throws(() => normalisePercentage(-1, 40), RangeError);
  assert.throws(() => normalisePercentage(10, 0), RangeError);
});

test('rounding is half-up and survives binary float error', () => {
  assert.equal(roundHalfUp(67.05, 1), 67.1);
  assert.equal(roundHalfUp(13.05 + 7.25 + 7.75 + 39, 1), 67.1);
  assert.equal(roundHalfUp(49.95, 1), 50);
  assert.equal(roundHalfUp(70.125, 1), 70.1);
});

/* --------------------------------------------------------- config invariants */

test('valid profiles pass validation', () => {
  assert.deepEqual(validateConfig(PROFILE_A), []);
  assert.deepEqual(validateConfig(PROFILE_B), []);
});

test('CA sub-components that do not sum to the CA weight are rejected', () => {
  const broken: AssessmentConfig = {
    ...PROFILE_A,
    components: [
      { key: 'consultation', label: 'C', kind: 'CONSULTATION', weightPoints: 20 },
      { key: 'p1', label: 'P1', kind: 'PRESENTATION', weightPoints: 10 },
      { key: 'p2', label: 'P2', kind: 'PRESENTATION', weightPoints: 15 },
    ],
  };
  const errors = validateConfig(broken);
  assert.equal(errors.length, 1);
  assert.equal(errors[0]!.field, 'components');
  assert.match(errors[0]!.message, /sum to 45 but CA weight is 40/);
});

test('CA and documentation weights that do not total 100 are rejected', () => {
  const errors = validateConfig({ ...PROFILE_A, documentationWeight: 55 });
  assert.ok(errors.some((e) => e.field === 'caWeight+documentationWeight'));
});

test('a weighted consultation component under GATE_ONLY is rejected', () => {
  const errors = validateConfig({
    ...PROFILE_A,
    consultation: { ...PROFILE_A.consultation, policy: 'GATE_ONLY' },
  });
  assert.ok(errors.some((e) => e.field === 'consultation.policy'));
});

/* -------------------------------------------------------- consultation rules */

test('below the minimum, the average is scaled by the compliance factor', () => {
  const r = evaluateConsultations(
    [consult('SEM1', 70, '1'), consult('SEM1', 70, '2')],
    { ...PROFILE_A.consultation, periodIds: ['SEM1'] },
  );
  assert.equal(r.periods[0]!.complianceFactor, 0.5);
  assert.equal(r.percentage, 35); // 70 x 0.5, no bonus
  assert.equal(r.gateMet, false);
});

test('above the minimum, extra consultations earn a capped bonus', () => {
  const scores = [60, 60, 60, 60, 60, 60, 60, 60]; // 8 of 4 required
  const r = evaluateConsultations(
    scores.map((s, i) => consult('SEM1', s, String(i))),
    { ...PROFILE_A.consultation, periodIds: ['SEM1'] },
  );
  assert.equal(r.periods[0]!.engagementBonus, 5); // 2 x 4 extra = 8, capped at 5
  assert.equal(r.percentage, 65);
});

test('no-shows and unattested sessions are excluded, never counted as zero', () => {
  const records: ConsultationRecord[] = [
    consult('SEM1', 80, '1'),
    consult('SEM1', 80, '2'),
    { id: '3', periodId: 'SEM1', status: 'NO_SHOW_STUDENT', supervisorAttested: true, studentAttested: false, score: null },
    { id: '4', periodId: 'SEM1', status: 'COMPLETED', supervisorAttested: true, studentAttested: false, score: 20 },
  ];
  const r = evaluateConsultations(records, { ...PROFILE_A.consultation, periodIds: ['SEM1'] });
  assert.equal(r.periods[0]!.gradedCount, 2);
  assert.equal(r.periods[0]!.noShowCount, 1);
  assert.equal(r.periods[0]!.rawMean, 80); // the unattested 20 did not drag it down
});

/* ------------------------------------------------------------ panel grading */

test('a blank assessor row is excluded, not averaged in as zero', () => {
  const withBlank: AssessorEntry[] = [
    ...P1_PANEL,
    { assessorId: 'a4', rubricVersionId: 'rv-p1-1', rubricMax: 40, criterionScores: { c1: null }, submitted: true },
  ];
  const r = aggregatePanel(withBlank, PROFILE_A.panel);
  assert.equal(r.status, 'OK');
  assert.equal(r.percentage, 72.5); // unchanged by the blank sheet
  assert.deepEqual(r.excludedAssessorIds, ['a4']);
});

test('an unsubmitted sheet does not contribute', () => {
  const r = aggregatePanel(
    [P1_PANEL[0]!, P1_PANEL[1]!, entry('a3', 30, P1_MAXIMA, 'rv-p1-1', { submitted: false })],
    PROFILE_A.panel,
  );
  assert.equal(r.status, 'INSUFFICIENT_ASSESSORS');
  assert.equal(r.percentage, null);
});

test('assessor spread beyond the threshold forces moderation', () => {
  const r = aggregatePanel(
    [entry('a1', 12, P1_MAXIMA, 'rv-p1-1'), entry('a2', 30, P1_MAXIMA, 'rv-p1-1'), entry('a3', 29, P1_MAXIMA, 'rv-p1-1')],
    PROFILE_A.panel,
  );
  assert.equal(r.status, 'MODERATION_REQUIRED');
  assert.equal(r.percentage, null);
  assert.equal(r.spread, 45);
});

test('a recorded moderation resolves the discrepancy', () => {
  const r = aggregatePanel(
    [entry('a1', 12, P1_MAXIMA, 'rv-p1-1'), entry('a2', 30, P1_MAXIMA, 'rv-p1-1'), entry('a3', 29, P1_MAXIMA, 'rv-p1-1')],
    PROFILE_A.panel,
    { moderatorId: 'coord-1', rationale: 'a1 graded the wrong session', agreedPercentage: 73.75, moderatedAt: '2026-05-02T09:00:00Z' },
  );
  assert.equal(r.status, 'OK');
  assert.equal(r.source, 'MODERATED');
  assert.equal(r.percentage, 73.75);
});

/* --------------------------------------------------- FIXTURE A — Profile A */

test('FIXTURE A: consultation-weighted profile computes 67.1', () => {
  const consultations: ConsultationRecord[] = [
    ...[72, 68, 80, 75, 85].map((s, i) => consult('SEM1', s, `s1-${i}`)),
    ...[70, 74, 66].map((s, i) => consult('SEM2', s, `s2-${i}`)),
  ];

  const snapshot = computeFinalMark(
    {
      studentId: '202201425',
      cycleId: '2025/2026',
      consultations,
      presentations: [
        { componentKey: 'p1', entries: P1_PANEL },
        { componentKey: 'p2', entries: P2_PANEL },
      ],
      documentation: { rawTotal: 65, rubricMax: 100, rubricVersionId: 'rv-doc-1', markedBy: 'sup-1' },
      computedBy: 'coord-1',
      now: new Date('2026-06-01T08:00:00Z'),
    },
    PROFILE_A,
  );

  const byKey = Object.fromEntries(snapshot.components.map((c) => [c.key, c]));
  assert.equal(byKey.consultation!.percentage, 65.25);
  assert.equal(byKey.consultation!.points, 13.05);
  assert.equal(byKey.p1!.points, 7.25);
  assert.equal(byKey.p2!.points, 7.75);

  assert.equal(snapshot.caPoints, 28.05);
  assert.equal(snapshot.caScore, 70.1);
  assert.equal(snapshot.documentationPoints, 39);
  assert.equal(snapshot.finalMark, 67.1);
  assert.equal(snapshot.grade, 'C');
  assert.equal(snapshot.blocked, false);

  // the snapshot is self-describing: it records what produced the number
  assert.deepEqual(snapshot.rubricVersionIds, ['rv-doc-1', 'rv-p1-1', 'rv-p2-1']);
  assert.equal(snapshot.policies.consultation, 'MEAN_WITH_COMPLIANCE_FACTOR');
  assert.equal(snapshot.profileCode, 'A');
});

/* --------------------------------------------------- FIXTURE B — Profile B */

test('FIXTURE B: same inputs under the legacy profile compute 69.4 and flag the gate', () => {
  const consultations: ConsultationRecord[] = [
    ...Array.from({ length: 5 }, (_, i) => consult('SEM1', 70, `s1-${i}`)),
    ...Array.from({ length: 3 }, (_, i) => consult('SEM2', 70, `s2-${i}`)),
  ];

  const snapshot = computeFinalMark(
    {
      studentId: '202201425',
      cycleId: '2025/2026',
      consultations,
      presentations: [
        { componentKey: 'p1', entries: P1_PANEL },
        { componentKey: 'p2', entries: P2_PANEL },
      ],
      documentation: { rawTotal: 65, rubricMax: 100, rubricVersionId: 'rv-doc-1', markedBy: 'sup-1' },
      computedBy: 'coord-1',
      now: new Date('2026-06-01T08:00:00Z'),
    },
    PROFILE_B,
  );

  assert.equal(snapshot.caScore, 76);
  assert.equal(snapshot.finalMark, 69.4);
  assert.equal(snapshot.profileCode, 'B');

  const gate = snapshot.flags.find((f) => f.code === 'CONSULTATION_MINIMUM_UNMET');
  assert.ok(gate, 'expected the consultation gate to be flagged');
  assert.equal(gate!.blocking, true);
  assert.equal(snapshot.blocked, true);
  assert.equal(snapshot.grade, null); // flagged results are not graded until resolved
});

test('the two profiles disagree on the same inputs — which is the whole point', () => {
  const consultations = [
    ...[72, 68, 80, 75, 85].map((s, i) => consult('SEM1', s, `s1-${i}`)),
    ...[70, 74, 66].map((s, i) => consult('SEM2', s, `s2-${i}`)),
  ];
  const base = {
    studentId: 'x', cycleId: '2025/2026', consultations,
    presentations: [
      { componentKey: 'p1', entries: P1_PANEL },
      { componentKey: 'p2', entries: P2_PANEL },
    ],
    documentation: { rawTotal: 65, rubricMax: 100, rubricVersionId: 'rv-doc-1', markedBy: 'sup-1' },
    computedBy: 'coord-1',
  };
  assert.equal(computeFinalMark(base, PROFILE_A).finalMark, 67.1);
  assert.equal(computeFinalMark(base, PROFILE_B).finalMark, 69.4);
});

/* ------------------------------------------------------------ blocking paths */

test('an ungraded presentation blocks the mark rather than scoring zero', () => {
  const snapshot = computeFinalMark(
    {
      studentId: 'x', cycleId: '2025/2026',
      consultations: [72, 68, 80, 75].map((s, i) => consult('SEM1', s, `a${i}`)),
      presentations: [{ componentKey: 'p1', entries: P1_PANEL }],
      documentation: { rawTotal: 65, rubricMax: 100, rubricVersionId: 'rv-doc-1', markedBy: 'sup-1' },
      computedBy: 'coord-1',
    },
    PROFILE_A,
  );
  assert.equal(snapshot.blocked, true);
  assert.equal(snapshot.finalMark, null);
  assert.ok(snapshot.flags.some((f) => f.code === 'PRESENTATION_PENDING'));
});

test('unmarked documentation blocks the mark', () => {
  const snapshot = computeFinalMark(
    {
      studentId: 'x', cycleId: '2025/2026',
      consultations: [72, 68, 80, 75].map((s, i) => consult('SEM1', s, `a${i}`)),
      presentations: [
        { componentKey: 'p1', entries: P1_PANEL },
        { componentKey: 'p2', entries: P2_PANEL },
      ],
      computedBy: 'coord-1',
    },
    PROFILE_A,
  );
  assert.equal(snapshot.blocked, true);
  assert.equal(snapshot.documentationScore, null);
  assert.ok(snapshot.flags.some((f) => f.code === 'DOCUMENTATION_MISSING'));
});
