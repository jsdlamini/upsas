/**
 * Produces sample exports from genuinely computed snapshots — every figure in
 * these files came through the assessment engine, not a fixture table.
 */
import { writeFileSync } from 'node:fs';
import { computeFinalMark, PROFILE_A } from '../src/lib/assessment/index';
import type { AssessorEntry, ConsultationRecord, MarkSnapshot } from '../src/lib/assessment/types';
import {
  buildMarkSchedule, buildConsultationRegister, summariseRegister, buildManifest,
  type ScheduleRow, type RegisterRow,
} from '../src/lib/reports/index';

const P1 = [5, 5, 5, 5, 5, 5, 5, 2, 3];
const P2 = [5, 5, 5, 15, 25, 10, 5, 5, 5];
const spread = (t: number, m: number[]) => {
  const o: Record<string, number | null> = {}; let l = t;
  m.forEach((mx, i) => { const v = Math.min(mx, l); o[`c${i + 1}`] = v; l -= v; });
  return o;
};
const sheet = (id: string, t: number, m: number[], rv: string): AssessorEntry =>
  ({ assessorId: id, rubricVersionId: rv, rubricMax: m.reduce((a, b) => a + b, 0),
     criterionScores: spread(t, m), submitted: true });
const cons = (p: string, s: number, i: string): ConsultationRecord =>
  ({ id: i, periodId: p, status: 'COMPLETED', supervisorAttested: true, studentAttested: true, score: s });

const PANEL = ['mahlalela', 'nkosi', 'dlamini', 'shongwe', 'fakudze', 'gama'];

function snap(studentId: string, s1: number[], s2: number[], p1: number, p2: number, doc: number | null): MarkSnapshot {
  return computeFinalMark({
    studentId, cycleId: '2025/2026',
    consultations: [
      ...s1.map((v, i) => cons('SEM1', v, `${studentId}-1-${i}`)),
      ...s2.map((v, i) => cons('SEM2', v, `${studentId}-2-${i}`)),
    ],
    presentations: [
      { componentKey: 'p1', entries: PANEL.map((a, i) => sheet(a, p1 + (i % 3) - 1, P1, 'rv-p1-1')) },
      { componentKey: 'p2', entries: PANEL.map((a, i) => sheet(a, p2 + (i % 3) - 1, P2, 'rv-p2-1')) },
    ],
    ...(doc === null ? {} : { documentation: { rawTotal: doc, rubricMax: 100, rubricVersionId: 'rv-doc-1', markedBy: 'mahlalela' } }),
    computedBy: 'coordinator', now: new Date('2026-09-14T09:52:00Z'),
  }, PROFILE_A);
}

const people: Array<[string, string, string, string, number, ScheduleRow['groupSize']]> = [
  ['209900101', 'Dlamini', 'Sipho A.', 'BSc IT', 0, 2],
  ['209900102', 'Mabuza', 'Nomsa T.', 'BSc IT', 1, 2],
  ['209900103', 'Ginindza', 'Musa K.', 'BSc CS Education', 2, 1],
  ['209900104', 'Simelane', 'Lindiwe P.', 'BSc CS Education', 3, 1],
  ['209900105', 'Vilakati', 'Bongani M.', 'BSc IT', 4, 1],
  ['209900106', 'Magagula', 'Thandi N.', 'BSc CS Education', 5, 1],
  ['209900107', 'Hlophe', 'Sanele B.', 'BSc', 6, 2],
  ['209900108', 'Zwane', 'Nokwanda R.', 'BSc', 7, 2],
];

const titles = [
  'SiSwati speech corpus and keyword spotting for radio archives',
  'SiSwati speech corpus and keyword spotting for radio archives',
  'Automated timetabling for large service courses',
  'A deep-learning approach to maize leaf disease detection',
  'Offline-first mobile records system for rural clinics',
  'Predictors of dropout in first-year programming',
  'Load forecasting for the Eswatini national grid',
  'Load forecasting for the Eswatini national grid',
];

const profiles: Array<[number[], number[], number, number, number | null]> = [
  [[72, 68, 80, 75, 85], [70, 74, 66], 29, 62, 65],
  [[70, 66, 72, 71], [68, 70, 72, 69], 27, 57, 61],
  [[80, 78, 84, 82], [79, 81, 85, 80], 33, 69, 74],
  [[66, 70, 68, 72], [70, 74, 66, 71], 28, 58, 65],
  [[62, 58, 64], [60, 63], 24, 47, 52],          // below the minimum, both periods
  [[74, 70, 76, 72], [71, 73, 69], 30, 61, null], // documentation not yet marked
  [[68, 72, 70, 74, 76], [72, 70, 74, 71], 26, 55, 60],
  [[70, 68, 72], [66, 70, 68, 71], 28, 63, 64],
];

const rows: ScheduleRow[] = people.map(([num, sur, other, prog, i, group]) => {
  const [s1, s2, p1, p2, doc] = profiles[i]!;
  return {
    studentNumber: num, surname: sur, otherNames: other, programme: prog,
    courseCode: prog === 'BSc CS Education' ? 'CSC402' : 'CSC499',
    supervisor: 'Dr T. Mahlalela', projectTitle: titles[i]!, groupSize: group,
    snapshot: snap(num, s1, s2, p1, p2, doc),
    published: doc !== null && !snap(num, s1, s2, p1, p2, doc).blocked,
  };
});

const schedule = buildMarkSchedule(rows);
writeFileSync('samples/mark-schedule-2025-2026.csv', schedule);

const includesUnpublished = rows.some((r) => !r.published);
writeFileSync('samples/mark-schedule-2025-2026.manifest.json', JSON.stringify(
  buildManifest({
    reportKey: 'mark-schedule', generatedBy: 'J. Dlamini (coordinator)',
    generatedAt: '2026-09-14T10:05:00.000Z', cycleId: '2025/2026',
    scopeDescription: 'CSC402 and CSC499, Department of Computer Science, 2025/2026',
    rowCount: rows.length, configIds: ['cfg-profile-a-v1'],
    snapshotIds: rows.map((r) => `snap-${r.studentNumber}`), includesUnpublished,
  }, 'mark-schedule-2025-2026.csv', 'CSV', schedule), null, 2) + '\n');

// Consultation register for one supervisor across the cycle.
const register: RegisterRow[] = [];
for (const [num, sur, other, , i] of people) {
  const [s1, s2] = profiles[i]!;
  const agendas = ['Topic scoping and objectives', 'Chapter 1 draft', 'Literature review draft',
                   'Methodology and instrument design', 'Implementation walkthrough',
                   'Results interpretation', 'Chapter 5 and formatting'];
  let d = 3;
  const push = (period: string, score: number, k: number) => {
    d += 7;
    const day = String(((d - 1) % 28) + 1).padStart(2, '0');
    const month = period === 'SEM1' ? '03' : '08';
    register.push({
      studentNumber: num, studentName: `${sur}, ${other}`, supervisor: 'Dr T. Mahlalela',
      periodCode: period, heldAt: `2026-${month}-${day}T10:00:00Z`, mode: k % 3 === 0 ? 'ONLINE' : 'IN_PERSON',
      status: 'COMPLETED', agenda: agendas[k % agendas.length]!,
      deliverableReviewed: `${sur.toLowerCase()}-ch${(k % 5) + 1}-v${(k % 3) + 1}.docx`,
      supervisorAttestedAt: `2026-${month}-${day}T10:45:00Z`,
      studentAttestedAt: `2026-${month}-${day}T10:47:00Z`,
      rawTotal: score, rubricMax: 100, counted: true, actionItems: (k % 3) + 1,
    });
  };
  s1.forEach((v, k) => push('SEM1', v, k));
  s2.forEach((v, k) => push('SEM2', v, k + 4));
  if (i === 4) {
    register.push({
      studentNumber: num, studentName: `${sur}, ${other}`, supervisor: 'Dr T. Mahlalela',
      periodCode: 'SEM2', heldAt: '2026-08-26T10:00:00Z', mode: 'IN_PERSON',
      status: 'NO_SHOW_STUDENT', agenda: 'Implementation walkthrough', deliverableReviewed: '',
      supervisorAttestedAt: '2026-08-26T10:20:00Z', studentAttestedAt: null,
      rawTotal: null, rubricMax: null, counted: false, actionItems: 0,
    });
  }
}
writeFileSync('samples/consultation-register-mahlalela.csv', buildConsultationRegister(register));

const summary = summariseRegister(register, 4, ['SEM1', 'SEM2']);
console.log('Mark schedule');
for (const r of rows) {
  console.log(
    `  ${r.studentNumber}  ${r.surname.padEnd(10)} CA ${String(r.snapshot.caScore ?? '—').padStart(5)}  ` +
    `final ${String(r.snapshot.finalMark ?? '—').padStart(5)}  ${r.snapshot.grade ?? '—'}  ` +
    `${r.published ? 'published' : r.snapshot.blocked ? 'BLOCKED: ' + r.snapshot.flags.filter(f => f.blocking).map(f => f.code).join(',') : 'ready'}`,
  );
}
console.log('\nConsultation register');
for (const s of summary) {
  console.log(`  ${s.studentNumber}  held ${s.held}  counted ${s.counted}  no-shows ${s.noShows}  ` +
              `minimum ${s.meetsMinimum ? 'met' : 'NOT MET'}`);
}
