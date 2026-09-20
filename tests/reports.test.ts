import test from 'node:test';
import assert from 'node:assert/strict';

import {
  escapeField, toCsv, sha256, buildManifest, buildMarkSchedule,
  buildConsultationRegister, summariseRegister, reportsFor, REPORTS,
  type ScheduleRow, type RegisterRow, type ManifestContext,
} from '../src/lib/reports/index';
import { computeFinalMark, PROFILE_A } from '../src/lib/assessment/index';
import type { MarkSnapshot, AssessorEntry, ConsultationRecord } from '../src/lib/assessment/types';

/* ---------------------------------------------------------------- helpers */

const P1 = [5, 5, 5, 5, 5, 5, 5, 2, 3];
const P2 = [5, 5, 5, 15, 25, 10, 5, 5, 5];

function spread(total: number, maxima: number[]): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  let left = total;
  maxima.forEach((m, i) => { const t = Math.min(m, left); out[`c${i + 1}`] = t; left -= t; });
  return out;
}
function sheet(id: string, total: number, maxima: number[], rv: string): AssessorEntry {
  return { assessorId: id, rubricVersionId: rv, rubricMax: maxima.reduce((a, b) => a + b, 0),
           criterionScores: spread(total, maxima), submitted: true };
}
function consult(period: string, score: number, id: string): ConsultationRecord {
  return { id, periodId: period, status: 'COMPLETED', supervisorAttested: true, studentAttested: true, score };
}

function snapshotFor(docMark: number): MarkSnapshot {
  return computeFinalMark({
    studentId: '209900101', cycleId: '2025/2026',
    consultations: [
      ...[72, 68, 80, 75, 85].map((s, i) => consult('SEM1', s, `a${i}`)),
      ...[70, 74, 66].map((s, i) => consult('SEM2', s, `b${i}`)),
    ],
    presentations: [
      { componentKey: 'p1', entries: [sheet('x', 28, P1, 'rv-p1-1'), sheet('y', 29, P1, 'rv-p1-1'), sheet('z', 30, P1, 'rv-p1-1')] },
      { componentKey: 'p2', entries: [sheet('x', 60, P2, 'rv-p2-1'), sheet('y', 62, P2, 'rv-p2-1'), sheet('z', 64, P2, 'rv-p2-1')] },
    ],
    documentation: { rawTotal: docMark, rubricMax: 100, rubricVersionId: 'rv-doc-1', markedBy: 'sup-1' },
    computedBy: 'coord-1', now: new Date('2026-09-14T09:52:00Z'),
  }, PROFILE_A);
}

function scheduleRow(studentNumber: string, surname: string, docMark: number, published = true): ScheduleRow {
  return {
    studentNumber, surname, otherNames: 'Test Case', programme: 'BSc IT',
    courseCode: 'CSC499', supervisor: 'Dr T. Mahlalela',
    projectTitle: 'A study of "quoted, comma" titles\nand newlines',
    groupSize: 2, snapshot: snapshotFor(docMark), published,
  };
}

/* ----------------------------------------------------------- CSV mechanics */

test('CSV escaping handles quotes, commas and newlines per RFC 4180', () => {
  assert.equal(escapeField('plain'), 'plain');
  assert.equal(escapeField('a,b'), '"a,b"');
  assert.equal(escapeField('say "hi"'), '"say ""hi"""');
  assert.equal(escapeField('line1\nline2'), '"line1\nline2"');
});

test('student numbers are quoted so a leading zero is not stripped by a spreadsheet', () => {
  const csv = buildMarkSchedule([scheduleRow('009900101', 'Dlamini', 65)]);
  assert.match(csv, /"009900101"/);
});

test('a title containing a comma, quotes and a newline survives a round trip', () => {
  const csv = buildMarkSchedule([scheduleRow('209900101', 'Dlamini', 65)]);
  assert.match(csv, /"A study of ""quoted, comma"" titles\nand newlines"/);
});

test('generation is deterministic — same input, identical bytes', () => {
  const rows = [scheduleRow('209900103', 'Ginindza', 61), scheduleRow('209900101', 'Dlamini', 65)];
  assert.equal(sha256(buildMarkSchedule(rows)), sha256(buildMarkSchedule([...rows].reverse())));
});

test('rows are ordered by student number regardless of input order', () => {
  const csv = buildMarkSchedule([scheduleRow('209900103', 'Ginindza', 61), scheduleRow('209900101', 'Dlamini', 65)]);
  const lines = csv.trim().split('\r\n');
  assert.match(lines[1]!, /209900101/);
  assert.match(lines[2]!, /209900103/);
});

/* ------------------------------------------- the schedule reports snapshots */

test('the schedule reports the snapshot rather than recomputing it', () => {
  const row = scheduleRow('209900101', 'Dlamini', 65);
  const csv = buildMarkSchedule([row]);
  assert.equal(row.snapshot.finalMark, 67.1);
  assert.match(csv, /,67\.1,C,Published,/);
  assert.match(csv, /,65\.3,72\.5,77\.5,70\.1,65\.0,/); // components as computed
});

test('a blocked mark is exported with its flags, not silently as a number', () => {
  const blocked = computeFinalMark({
    studentId: 'x', cycleId: '2025/2026',
    consultations: [consult('SEM1', 70, '1')],
    presentations: [{ componentKey: 'p1', entries: [sheet('x', 28, P1, 'rv-p1-1')] }],
    computedBy: 'coord-1',
  }, PROFILE_A);
  const csv = buildMarkSchedule([{ ...scheduleRow('209900109', 'Test', 65, false), snapshot: blocked }]);
  assert.match(csv, /Blocked/);
  assert.match(csv, /PRESENTATION_INSUFFICIENT_ASSESSORS/);
  assert.match(csv, /DOCUMENTATION_MISSING/);
});

/* ------------------------------------------------------------- provenance */

function ctx(over: Partial<ManifestContext> = {}): ManifestContext {
  return {
    reportKey: 'mark-schedule', generatedBy: 'coord-1',
    generatedAt: '2026-09-14T10:05:00.000Z', cycleId: '2025/2026',
    scopeDescription: 'All CSC499 students, 2025/2026', rowCount: 2,
    configIds: ['cfg-profile-a-v1'], snapshotIds: ['snap-1', 'snap-2'],
    includesUnpublished: false, ...over,
  };
}

test('the manifest hashes the exact bytes issued', () => {
  const content = buildMarkSchedule([scheduleRow('209900101', 'Dlamini', 65)]);
  const m = buildManifest(ctx(), 'mark-schedule.csv', 'CSV', content);
  assert.equal(m.sha256, sha256(content));
  assert.equal(m.byteLength, Buffer.byteLength(content, 'utf8'));
});

test('changing one mark changes the manifest hash', () => {
  const a = buildManifest(ctx(), 'f.csv', 'CSV', buildMarkSchedule([scheduleRow('209900101', 'D', 65)]));
  const b = buildManifest(ctx(), 'f.csv', 'CSV', buildMarkSchedule([scheduleRow('209900101', 'D', 66)]));
  assert.notEqual(a.sha256, b.sha256);
});

test('unpublished marks force a watermark', () => {
  const m = buildManifest(ctx({ includesUnpublished: true }), 'f.csv', 'CSV', 'x');
  assert.match(m.watermark!, /PROVISIONAL/);
});

test('a report that may not carry unpublished marks refuses to generate one', () => {
  assert.throws(
    () => buildManifest(ctx({ reportKey: 'student-mark-sheet', includesUnpublished: true }), 'f.pdf', 'PDFA', 'x'),
    /may not include unpublished marks/,
  );
});

test('personal-data reports carry a handling notice', () => {
  assert.match(buildManifest(ctx(), 'f.csv', 'CSV', 'x').notice, /Data Protection Act 41 of 2022/);
  assert.match(buildManifest(ctx({ reportKey: 'mark-distribution' }), 'f.csv', 'CSV', 'x').notice, /No personal data/);
});

/* ------------------------------------------------------ register behaviour */

const reg = (over: Partial<RegisterRow>): RegisterRow => ({
  studentNumber: '209900101', studentName: 'Dlamini, Sipho A.', supervisor: 'Dr T. Mahlalela',
  periodCode: 'SEM1', heldAt: '2026-03-04T10:00:00Z', mode: 'IN_PERSON', status: 'COMPLETED',
  agenda: 'Chapter 2 draft', deliverableReviewed: 'lit-review-v3.docx',
  supervisorAttestedAt: '2026-03-04T10:45:00Z', studentAttestedAt: '2026-03-04T10:47:00Z',
  rawTotal: 72, rubricMax: 100, counted: true, actionItems: 2, ...over,
});

test('the register keeps no-shows and uncounted sessions visible', () => {
  const csv = buildConsultationRegister([
    reg({}),
    reg({ heldAt: '2026-03-18T10:00:00Z', status: 'NO_SHOW_STUDENT', rawTotal: null,
          supervisorAttestedAt: '2026-03-18T10:20:00Z', studentAttestedAt: null, counted: false }),
  ]);
  assert.match(csv, /NO_SHOW_STUDENT/);
  assert.match(csv, /,No,/);
  assert.equal(csv.trim().split('\r\n').length, 3);
});

test('the register summary counts only attested, graded sessions', () => {
  const [s] = summariseRegister([
    reg({}),
    reg({ heldAt: '2026-03-11T10:00:00Z' }),
    reg({ heldAt: '2026-03-18T10:00:00Z', status: 'NO_SHOW_STUDENT', counted: false, rawTotal: null }),
    reg({ heldAt: '2026-03-25T10:00:00Z', studentAttestedAt: null, counted: false }),
  ], 4, ['SEM1']);
  assert.equal(s!.held, 3);
  assert.equal(s!.counted, 2);
  assert.equal(s!.noShows, 1);
  assert.equal(s!.meetsMinimum, false);
});

/* ------------------------------------------------------------ access scope */

test('the catalogue exposes only what a role may run', () => {
  const student = reportsFor(['STUDENT']).map((r) => r.key);
  assert.deepEqual(student.sort(), ['student-mark-sheet', 'subject-access']);
  assert.ok(!student.includes('mark-schedule'));

  const supervisor = reportsFor(['SUPERVISOR']).map((r) => r.key);
  assert.ok(supervisor.includes('consultation-register'));
  assert.ok(!supervisor.includes('audit-extract'));
});

test('every evidentiary report can be produced as PDF/A', () => {
  for (const r of REPORTS.filter((r) => r.evidentiary)) {
    assert.ok(r.formats.includes('PDFA'), `${r.key} is evidentiary but has no PDF/A output`);
  }
});
