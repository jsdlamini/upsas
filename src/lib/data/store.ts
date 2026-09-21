import { hashPassword, checkPassword } from '../auth/password';
import type { RoleGrant } from '../auth/roles';
import type { AssessorEntry, ConsultationRecord } from '../assessment/types';
import { loadPersistedState, savePersistedState, persistenceEnabled, type SaveOutcome } from '../persistence';
import { groupCommit } from '../group-commit';
import {
  defaultEnrolment, validateChange, appearsInCohort, isAssessable,
  type Enrolment, type EnrolmentStatus, type CarriedComponent,
} from '../enrolment/status';
import {
  validateDeadline, validateExtension, statusOf,
  type Deadline, type Extension,
} from '../deadlines/schedule';
import {
  issueTicket, redeem, revokeOutstanding, type ResetTicket,
} from '../auth/recovery';
import {
  planChange, migrateSheet, describePlan,
  type Instrument, type Draft, type ChangePlan, type PlanResult,
} from '../rubrics/instrument';
import { notifyUser, sendEmail } from '../notifications';
import { renderNoticeEmail } from '../meetings/email';
import {
  makeNotice, supersede, visibleFor, dismiss, dismissAll, whenLabel, recentlySeen, hrefOf,
  type MeetingNotice, type NoticeKind,
} from '../meetings/notices';

/**
 * In-memory development store.
 *
 * Stands in for PostgreSQL so the application can be driven end to end before
 * persistence is wired up. It is process-local and resets on restart — every
 * write goes through a function here, so swapping in Prisma is a change to this
 * module and nothing above it.
 */

export const CYCLE = '2025/2026';
export const DEMO_PASSWORD = 'upsas-demo-passphrase';

export interface Person {
  id: string;
  username: string;
  fullName: string;
  surname: string;
  grants: RoleGrant[];
  totpConfirmed: boolean;
  /** Set on student accounts, linking the login to the student record. */
  studentId?: string;
  /** Account lifecycle state; defaults to ACTIVE. */
  status?: 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  email?: string;
  /** Roles a staff applicant asked for; empty until a coordinator approves. */
  requestedRoles?: Array<RoleGrant['role']>;
  /** Offline TOTP secret (base32) for privileged roles; absent = not enrolled. */
  totpSecret?: string;
}

export interface Student {
  id: string;
  studentNumber: string;
  surname: string;
  otherNames: string;
  programme: string;
  courseCode: string;
  projectId: string;
  /** Given at registration. Used for meeting and result emails. */
  email?: string;
}

export interface Project {
  id: string;
  title: string;
  supervisorId: string;
  memberIds: string[];
  state: string;
  ethicsStatus: 'NOT_REQUIRED' | 'SUBMITTED' | 'APPROVED';
  contributionFiled: Record<string, boolean>;
  /** Set when the project was created from an allocated topic. */
  topicId?: string;
}

export interface Topic {
  id: string;
  supervisorId: string;
  title: string;
  description: string;
  prerequisites: string;
  tags: string[];
  capacity: number;
  groupSuitable: boolean;
  published: boolean;
  studentProposed: boolean;
  proposedBy: string | null;
  /** Set when a supervisor accepts a student-proposed topic. */
  acceptedAt: string | null;
}

export interface Preference {
  studentId: string;
  topicId: string;
  rank: number;
}

export interface Slot {
  id: string;
  supervisorId: string;
  startsAt: string;
  minutes: number;
  mode: 'IN_PERSON' | 'ONLINE';
  venue: string;
  bookedByStudentId: string | null;
  agenda: string | null;
  /** Booking lifecycle: unset = open, REQUESTED = awaiting supervisor, CONFIRMED = approved. */
  status?: 'REQUESTED' | 'CONFIRMED' | undefined;
  /** Meeting link when the session is virtual. */
  meetingLink?: string | null;
}

export interface SessionSlot {
  serial: number;
  component: 'p1' | 'p2';
  studentIds: string[];
  /** True when the slot is one joint project rather than two individuals. */
  joint: boolean;
  scheduledFor: string;
  venue: string;
}

export interface Sheet {
  assessorId: string;
  studentId: string;
  component: 'p1' | 'p2';
  rubricVersionId: string;
  rubricMax: number;
  marks: Record<string, number | null>;
  submitted: boolean;
  submittedAt: string | null;
}

export interface Consultation {
  id: string;
  studentId: string;
  periodId: 'SEM1' | 'SEM2';
  heldAt: string;
  status: ConsultationRecord['status'];
  supervisorAttested: boolean;
  studentAttested: boolean;
  rawTotal: number | null;
  rubricMax: number;
  agenda: string;
}

export interface DocMark {
  studentId: string;
  rawTotal: number;
  rubricMax: number;
  markedBy: string;
  moderatedBy: string | null;
  agreedRawTotal: number | null;
}

/** A student's request to meet their supervisor when no slot is open. */
export interface MeetingRequest {
  id: string;
  studentId: string;
  supervisorId: string;
  agenda: string;
  preferredTimes: string;
  status: 'PENDING' | 'APPROVED' | 'DECLINED';
  requestedAt: string;
  decidedAt: string | null;
}

/** An e-signature on a topic & supervision agreement. */
export interface AgreementSignature {
  id: string;
  projectId: string;
  signerId: string;
  name: string;
  role: 'Student' | 'Supervisor' | 'Coordinator';
  signedAt: string;
}

/** A versioned project deliverable (proposal, chapters, slides, …). */
export interface DeliverableRecord {
  id: string;
  projectId: string;
  kind: string;
  title: string;
  version: number;
  mediaType: string;
  byteSize: number;
  sha256: string;
  scanStatus: 'PENDING' | 'OK' | 'INFECTED' | 'SKIPPED';
  uploadedById: string;
  uploadedAt: string;
}

const grant = (role: RoleGrant['role'], cycleId: string | null = CYCLE): RoleGrant => ({
  role, cycleId, grantedAt: '2026-02-01T00:00:00Z', revokedAt: null,
});

const globalForPeople = globalThis as unknown as { __upsasPeople?: Person[]; __upsasStaff?: Person[] };

export const PEOPLE: Person[] = (globalForPeople.__upsasPeople ??= [
  { id: 'u-mahlalela', username: 'tmahlalela', fullName: 'Dr T. Mahlalela', surname: 'Mahlalela',
    grants: [grant('SUPERVISOR'), grant('ASSESSOR'), grant('MODERATOR')], totpConfirmed: false },
  { id: 'u-nkosi', username: 'bnkosi', fullName: 'Mr B. Nkosi', surname: 'Nkosi',
    grants: [grant('SUPERVISOR'), grant('ASSESSOR')], totpConfirmed: false },
  { id: 'u-sdlamini', username: 'sdlamini', fullName: 'Dr S. Dlamini', surname: 'Dlamini',
    grants: [grant('ASSESSOR'), grant('MODERATOR')], totpConfirmed: false },
  { id: 'u-shongwe', username: 'pshongwe', fullName: 'Ms P. Shongwe', surname: 'Shongwe',
    grants: [grant('ASSESSOR')], totpConfirmed: false },
  { id: 'u-coord', username: 'coordinator', fullName: 'J. Dlamini', surname: 'Dlamini',
    grants: [grant('COORDINATOR'), grant('ASSESSOR')], totpConfirmed: true,
    // Demo TOTP secret (base32). Add it to an authenticator app to generate
    // the six-digit code the coordinator is challenged for.
    totpSecret: 'IOTL7XO7EZ2BFO5ZD5V7X427T7I4LIJH' },
]);

/** Staff accounts requested through the registration screen, awaiting a coordinator. */
export const REGISTERED_STAFF: Person[] = (globalForPeople.__upsasStaff ??= []);

/** Students sign in too — dual attestation is meaningless if only staff have accounts. */
export function studentAccounts(): Person[] {
  return STUDENTS.map((s) => ({
    id: `u-${s.id}`, username: s.studentNumber, fullName: `${s.surname}, ${s.otherNames}`,
    surname: s.surname, totpConfirmed: false, studentId: s.id,
    grants: [grant('STUDENT')],
    ...(s.email ? { email: s.email } : {}),
  }));
}

const globalForStudents = globalThis as unknown as { __upsasStudents?: Student[] };

export const STUDENTS: Student[] = (globalForStudents.__upsasStudents ??= [
  { id: 's1', studentNumber: '209900101', surname: 'Dlamini', otherNames: 'Sipho A.', programme: 'BSc IT', courseCode: 'CSC499', projectId: 'p-speech' },
  { id: 's2', studentNumber: '209900102', surname: 'Mabuza', otherNames: 'Nomsa T.', programme: 'BSc IT', courseCode: 'CSC499', projectId: 'p-speech' },
  { id: 's3', studentNumber: '209900103', surname: 'Ginindza', otherNames: 'Musa K.', programme: 'BSc CS Education', courseCode: 'CSC402', projectId: 'p-timetable' },
  { id: 's4', studentNumber: '209900104', surname: 'Simelane', otherNames: 'Lindiwe P.', programme: 'BSc CS Education', courseCode: 'CSC402', projectId: 'p-maize' },
  { id: 's5', studentNumber: '209900105', surname: 'Vilakati', otherNames: 'Bongani M.', programme: 'BSc IT', courseCode: 'CSC499', projectId: 'p-clinic' },
  { id: 's6', studentNumber: '209900106', surname: 'Magagula', otherNames: 'Thandi N.', programme: 'BSc CS Education', courseCode: 'CSC402', projectId: 'p-dropout' },
  { id: 's7', studentNumber: '209900107', surname: 'Hlophe', otherNames: 'Sanele B.', programme: 'BSc', courseCode: 'CSC499', projectId: 'p-grid' },
  { id: 's8', studentNumber: '209900108', surname: 'Zwane', otherNames: 'Nokwanda R.', programme: 'BSc', courseCode: 'CSC499', projectId: 'p-grid' },
  // Not yet allocated: registered, choosing a topic. Without one of these the
  // ranking and allocation flow is unreachable in the demo.
  { id: 's9', studentNumber: '209900109', surname: 'Nhlabatsi', otherNames: 'Ayanda M.', programme: 'BSc IT', courseCode: 'CSC499', projectId: 'unallocated' },
]);

/** Students with no project yet — they rank topics rather than being assessed. */
export const unallocatedStudents = () => STUDENTS.filter((s) => !findProject(s.projectId));
export const allocatedStudents = () => STUDENTS.filter((s) => findProject(s.projectId));

const globalForProjects = globalThis as unknown as { __upsasProjects?: Project[] };

export const PROJECTS: Project[] = (globalForProjects.__upsasProjects ??= [
  { id: 'p-speech', title: 'SiSwati speech corpus and keyword spotting for radio archives', supervisorId: 'u-mahlalela', memberIds: ['s1', 's2'], state: 'P2_NOMINATED', ethicsStatus: 'APPROVED', contributionFiled: { s1: true, s2: false } },
  { id: 'p-timetable', title: 'Automated timetabling for large service courses', supervisorId: 'u-nkosi', memberIds: ['s3'], state: 'IMPLEMENTATION', ethicsStatus: 'NOT_REQUIRED', contributionFiled: { s3: true } },
  { id: 'p-maize', title: 'A deep-learning approach to maize leaf disease detection', supervisorId: 'u-mahlalela', memberIds: ['s4'], state: 'SUPERVISOR_MARKED', ethicsStatus: 'APPROVED', contributionFiled: { s4: true } },
  { id: 'p-clinic', title: 'Offline-first mobile records system for rural clinics', supervisorId: 'u-mahlalela', memberIds: ['s5'], state: 'IMPLEMENTATION', ethicsStatus: 'APPROVED', contributionFiled: { s5: true } },
  { id: 'p-dropout', title: 'Predictors of dropout in first-year programming', supervisorId: 'u-mahlalela', memberIds: ['s6'], state: 'ETHICS_SUBMITTED', ethicsStatus: 'SUBMITTED', contributionFiled: { s6: true } },
  { id: 'p-grid', title: 'Load forecasting for the Eswatini national grid', supervisorId: 'u-mahlalela', memberIds: ['s7', 's8'], state: 'IMPLEMENTATION', ethicsStatus: 'NOT_REQUIRED', contributionFiled: { s7: true, s8: true } },
]);

export const P1_CRITERIA = [
  { id: 'c1', label: 'Background of study', max: 5 },
  { id: 'c2', label: 'Problem statement', max: 5 },
  { id: 'c3', label: 'Aim and objectives', max: 5 },
  { id: 'c4', label: 'Literature review', max: 5 },
  { id: 'c5', label: 'Identified gaps', max: 5 },
  { id: 'c6', label: 'Methodology', max: 5 },
  { id: 'c7', label: 'Implementation', max: 5 },
  { id: 'c8', label: 'In-text citation', max: 2 },
  { id: 'c9', label: 'References', max: 3 },
];

export const P2_CRITERIA = [
  { id: 'c1', label: 'Introduction', max: 5 },
  { id: 'c2', label: 'Problem statement', max: 5 },
  { id: 'c3', label: 'Aim and objectives', max: 5 },
  { id: 'c4', label: 'Methodology', max: 15 },
  { id: 'c5', label: 'Implementation', max: 25 },
  { id: 'c6', label: 'Results interpretation', max: 10 },
  { id: 'c7', label: 'Conclusion', max: 5 },
  { id: 'c8', label: 'Presentation skills', max: 5 },
  { id: 'c9', label: 'References', max: 5 },
];

/**
 * Assessment instruments, versioned.
 *
 * The coordinator edits these from /rubrics. What used to be a frozen constant
 * is now a table with a history, because the columns of a marking sheet are the
 * department's instrument and it changes between cycles. Nothing here is edited
 * in place once a mark exists against it — see src/lib/rubrics/instrument.ts.
 */
const globalForRubrics = globalThis as unknown as { __upsasRubrics?: Instrument[] };

export const RUBRIC_VERSIONS: Instrument[] = (globalForRubrics.__upsasRubrics ??= [
  {
    versionId: 'rv-p1-1', component: 'p1', version: 1, max: 40,
    title: 'Presentation 1 — Chapters 1 & 2',
    criteria: P1_CRITERIA.map((c) => ({ ...c })), locked: false,
    createdAt: '2025-08-01T08:00:00Z', createdBy: null,
    note: 'Transcribed verbatim from the 2024/2025 departmental assessment form.',
    supersededBy: null,
  },
  {
    versionId: 'rv-p2-1', component: 'p2', version: 1, max: 80,
    title: 'Presentation 2 — Chapters 3–5',
    criteria: P2_CRITERIA.map((c) => ({ ...c })), locked: false,
    createdAt: '2025-08-01T08:00:00Z', createdBy: null,
    note: 'Transcribed verbatim from the 2024/2025 departmental assessment form.',
    supersededBy: null,
  },
]);

/** The version in force for a component: the one nothing has superseded. */
export function activeInstrument(component: 'p1' | 'p2'): Instrument {
  const live = RUBRIC_VERSIONS.filter((r) => r.component === component && r.supersededBy === null);
  const latest = live[live.length - 1];
  if (!latest) throw new Error(`No live instrument for ${component}.`);
  return latest;
}

/** Newest first, for the version history on the editing screen. */
export function instrumentHistory(component: 'p1' | 'p2'): Instrument[] {
  return RUBRIC_VERSIONS.filter((r) => r.component === component)
    .slice().sort((a, b) => b.version - a.version);
}

export function instrumentById(versionId: string): Instrument | null {
  return RUBRIC_VERSIONS.find((r) => r.versionId === versionId) ?? null;
}

/**
 * Kept as `RUBRICS` so every existing call site reads the live instrument
 * without knowing versions exist. The getters matter: a rubric edited during
 * the request must not be served from a value captured at module load.
 */
export const RUBRICS = {
  get p1(): Instrument { return activeInstrument('p1'); },
  get p2(): Instrument { return activeInstrument('p2'); },
};

export const SESSIONS: SessionSlot[] = [
  { serial: 1, component: 'p2', studentIds: ['s1', 's2'], joint: true, scheduledFor: '2026-09-14T09:00:00Z', venue: 'CS-112' },
  { serial: 2, component: 'p2', studentIds: ['s3', 's4'], joint: false, scheduledFor: '2026-09-14T09:40:00Z', venue: 'CS-112' },
  { serial: 3, component: 'p2', studentIds: ['s5', 's6'], joint: false, scheduledFor: '2026-09-14T10:20:00Z', venue: 'CS-112' },
  { serial: 4, component: 'p2', studentIds: ['s7', 's8'], joint: true, scheduledFor: '2026-09-14T11:00:00Z', venue: 'CS-112' },
];

/* ------------------------------------------------------------ mutable state */

/**
 * Pinned to globalThis for the same reason as the session table: Next's dev
 * server re-evaluates server modules on hot reload, and un-pinned module state
 * would reset — a mark saved on one page would vanish on the next.
 */
export interface Publication {
  studentId: string;
  finalMark: number | null;
  grade: string | null;
  publishedBy: string;
  publishedAt: string;
  supersedes: string | null;
  reason: string | null;
}

export interface ModerationRow {
  studentId: string;
  component: 'p1' | 'p2';
  moderatorId: string;
  rationale: string;
  agreedPercentage: number;
  moderatedAt: string;
}

interface Tables {
  consultations: Consultation[]; sheets: Sheet[]; docMarks: DocMark[];
  publications: Publication[]; moderations: ModerationRow[];
  topics: Topic[]; preferences: Preference[]; slots: Slot[];
  meetingRequests: MeetingRequest[]; signatures: AgreementSignature[];
  deliverables: DeliverableRecord[];
  passwords: Record<string, string>;
  enrolments: Enrolment[];
  deadlines: Deadline[];
  extensions: Extension[];
  resetTickets: ResetTicket[];
  meetingNotices: MeetingNotice[];
  /** Addresses a coordinator set, keyed by account id. Wins over the rest. */
  contactEmails: Record<string, string>;
  seeded: boolean;
}
const globalForData = globalThis as unknown as { __upsasData?: Tables };
const tables: Tables = (globalForData.__upsasData ??= {
  consultations: [], sheets: [], docMarks: [], publications: [], moderations: [],
  topics: [], preferences: [], slots: [], meetingRequests: [], signatures: [], deliverables: [], passwords: {},
  enrolments: [], deadlines: [], extensions: [], resetTickets: [], meetingNotices: [], contactEmails: {}, seeded: false,
});
const consultations = tables.consultations;
const sheets = tables.sheets;
const docMarks = tables.docMarks;
const publications = tables.publications;
const moderations = tables.moderations;
const topics = tables.topics;
const preferences = tables.preferences;
const slots = tables.slots;
const meetingRequests = tables.meetingRequests;
const signatures = tables.signatures;
const deliverables = tables.deliverables;
const enrolments = tables.enrolments;
const deadlines = tables.deadlines;
const extensions = tables.extensions;
const resetTickets = tables.resetTickets;
// Older persisted snapshots predate this table.
tables.meetingNotices ??= [];
tables.contactEmails ??= {};
const meetingNotices = tables.meetingNotices;

function seedConsultations(): void {
  const plan: Record<string, [number[], number[]]> = {
    s1: [[72, 68, 80, 75, 85], [70, 74, 66]],
    s2: [[70, 66, 72, 71], [68, 70, 72, 69]],
    s3: [[80, 78, 84, 82], [79, 81, 85, 80]],
    s4: [[66, 70, 68, 72], [70, 74, 66, 71]],
    s5: [[62, 58, 64], [60, 63]],
    s6: [[74, 70, 76, 72], [71, 73, 69]],
    s7: [[68, 72, 70, 74, 76], [72, 70, 74, 71]],
    s8: [[70, 68, 72], [66, 70, 68, 71]],
  };
  const agendas = ['Topic scoping and objectives', 'Chapter 1 draft', 'Literature review draft',
                   'Methodology and instruments', 'Implementation walkthrough',
                   'Results interpretation', 'Chapter 5 and formatting'];
  for (const [studentId, [s1, s2]] of Object.entries(plan)) {
    let day = 3;
    const add = (periodId: 'SEM1' | 'SEM2', score: number, k: number) => {
      day += 7;
      const dd = String(((day - 1) % 28) + 1).padStart(2, '0');
      consultations.push({
        id: `${studentId}-${periodId}-${k}`, studentId, periodId,
        heldAt: `2026-${periodId === 'SEM1' ? '03' : '08'}-${dd}T10:00:00Z`,
        status: 'COMPLETED', supervisorAttested: true, studentAttested: true,
        rawTotal: score, rubricMax: 100, agenda: agendas[k % agendas.length]!,
      });
    };
    s1!.forEach((v, k) => add('SEM1', v, k));
    s2!.forEach((v, k) => add('SEM2', v, k + 4));
  }
  consultations.push({
    id: 's5-noshow', studentId: 's5', periodId: 'SEM2', heldAt: '2026-08-26T10:00:00Z',
    status: 'NO_SHOW_STUDENT', supervisorAttested: true, studentAttested: false,
    rawTotal: null, rubricMax: 100, agenda: 'Implementation walkthrough',
  });
}

function seedSheets(): void {
  // P1 is complete for everyone; P2 is partially graded, which is the state the
  // grading screen is most useful in.
  const p1Totals: Record<string, number> = { s1: 29, s2: 27, s3: 33, s4: 28, s5: 24, s6: 30, s7: 26, s8: 28 };
  const p2Totals: Record<string, number> = { s1: 64, s2: 57, s3: 69, s4: 58, s5: 47, s6: 61, s7: 55, s8: 63 };
  const assessors = ['u-mahlalela', 'u-nkosi', 'u-sdlamini', 'u-shongwe'];

  for (const st of STUDENTS) {
    assessors.forEach((a, i) => {
      sheets.push(makeSheet(a, st.id, 'p1', (p1Totals[st.id] ?? 28) + (i % 3) - 1, true));
    });
    assessors.forEach((a, i) => {
      // Mahlalela has not submitted P2 yet — that is the sheet the demo grades.
      const submitted = a !== 'u-mahlalela';
      const total = (p2Totals[st.id] ?? 60) + (i % 3) - 1;
      if (submitted) sheets.push(makeSheet(a, st.id, 'p2', total, true));
    });
  }
  // One assessor graded Magagula against the wrong session. The spread exceeds the
  // 15-point threshold, so her Presentation 2 is blocked pending moderation — the
  // moderation queue needs something real in it.
  const stray = sheets.find((s) => s.studentId === 's6' && s.component === 'p2' && s.assessorId === 'u-shongwe');
  if (stray) {
    for (const c of RUBRICS.p2.criteria) stray.marks[c.id] = Math.floor(c.max * 0.25);
  }

  // A partially entered row and two untouched rows for Mahlalela.
  sheets.push(makeSheet('u-mahlalela', 's1', 'p2', 64, false));
  sheets.push(makeSheet('u-mahlalela', 's2', 'p2', 57, false));
  sheets.push(makeSheet('u-mahlalela', 's3', 'p2', 69, false));
}

function makeSheet(assessorId: string, studentId: string, component: 'p1' | 'p2', total: number, submitted: boolean): Sheet {
  const rubric = RUBRICS[component];
  // Spread the total across criteria in proportion to their maxima, then push
  // the rounding remainder onto the largest criteria. A greedy fill would leave
  // the last criteria at zero, which looks like a marking error rather than seed data.
  const marks: Record<string, number | null> = {};
  const share = total / rubric.max;
  let assigned = 0;
  for (const c of rubric.criteria) {
    const v = Math.min(c.max, Math.round(c.max * share));
    marks[c.id] = v;
    assigned += v;
  }
  let remainder = total - assigned;
  const byMax = [...rubric.criteria].sort((a, b) => b.max - a.max);
  for (const c of byMax) {
    if (remainder === 0) break;
    const current = marks[c.id] as number;
    const step = remainder > 0 ? Math.min(remainder, c.max - current) : Math.max(remainder, -current);
    marks[c.id] = current + step;
    remainder -= step;
  }
  return {
    assessorId, studentId, component, rubricVersionId: rubric.versionId,
    rubricMax: rubric.max, marks, submitted,
    submittedAt: submitted ? '2026-09-10T12:00:00Z' : null,
  };
}

function seedTopics(): void {
  const seed: Array<[string, string, string, string, string[], number, boolean]> = [
    ['u-mahlalela', 'Low-resource speech recognition for siSwati',
     'Build and evaluate an ASR pipeline for siSwati using transfer learning from a multilingual base model. Suits a student comfortable with Python and willing to do transcription work.',
     'Python, basic machine learning', ['NLP', 'speech'], 2, true],
    ['u-mahlalela', 'Yield prediction for smallholder maize from satellite imagery',
     'Combine open satellite imagery with district yield records to forecast maize output. Involves geospatial data handling and regression modelling.',
     'Python, statistics', ['ML', 'agriculture'], 2, true],
    ['u-mahlalela', 'Offline-first data capture for rural health facilities',
     'Design and build a mobile client that works without connectivity and reconciles on reconnect. Strong systems project rather than a modelling one.',
     'Mobile development, databases', ['systems', 'mobile'], 1, false],
    ['u-nkosi', 'Automated timetabling under room and staff constraints',
     'Model the departmental timetable as a constraint-satisfaction problem and compare solver approaches against the hand-built schedule.',
     'Algorithms, discrete mathematics', ['optimisation'], 2, true],
    ['u-nkosi', 'Detecting academic plagiarism in code submissions',
     'Compare structural and token-based similarity measures on real student submissions, with attention to false positives on templated assignments.',
     'Algorithms, Python', ['security', 'education'], 1, true],
    ['u-sdlamini', 'Predictors of dropout in first-year programming',
     'A quantitative study relating assessment patterns, attendance and prior background to withdrawal. Requires ethical clearance.',
     'Statistics, survey design', ['education', 'statistics'], 2, true],
    ['u-sdlamini', 'Usability of government digital services in Eswatini',
     'Heuristic evaluation plus task-based user testing of selected public service portals.',
     'HCI, qualitative methods', ['HCI'], 2, true],
    ['u-shongwe', 'Network intrusion detection on constrained hardware',
     'Evaluate lightweight models for intrusion detection that can run on a Raspberry Pi class device.',
     'Networking, machine learning', ['security', 'ML'], 1, true],
  ];
  seed.forEach(([supervisorId, title, description, prerequisites, tags, capacity, groupSuitable], i) => {
    topics.push({
      id: `t-${i + 1}`, supervisorId, title, description, prerequisites, tags,
      capacity, groupSuitable, published: true, studentProposed: false,
      proposedBy: null, acceptedAt: null,
    });
  });
}

function seedSlots(): void {
  // Two weeks of Tuesday and Thursday slots for each supervisor.
  const base = new Date('2026-09-15T08:00:00Z');
  let n = 0;
  for (const sup of ['u-mahlalela', 'u-nkosi', 'u-sdlamini']) {
    for (let day = 0; day < 10; day += 1) {
      const d = new Date(base.getTime() + day * 86400000);
      if (d.getUTCDay() !== 2 && d.getUTCDay() !== 4) continue;
      for (const hour of [8, 9, 11, 14]) {
        n += 1;
        const starts = new Date(d);
        starts.setUTCHours(hour, 0, 0, 0);
        slots.push({
          id: `slot-${n}`, supervisorId: sup, startsAt: starts.toISOString(),
          minutes: 30, mode: hour === 14 ? 'ONLINE' : 'IN_PERSON',
          venue: hour === 14 ? 'Online' : 'CS-204',
          bookedByStudentId: null, agenda: null,
        });
      }
    }
  }
  // One already booked, so the screen is not empty of examples.
  const taken = slots.find((s) => s.supervisorId === 'u-mahlalela');
  if (taken) { taken.bookedByStudentId = 's1'; taken.agenda = 'Chapter 4 results'; }
}

function seedDocMarks(): void {
  const marks: Record<string, [number, number | null]> = {
    s1: [65, 65], s2: [61, 61], s3: [74, 74], s4: [65, 65],
    s5: [52, 52], s7: [60, 60], s8: [64, 64],
    // s6 is deliberately unmarked, so one student stays blocked.
  };
  for (const [studentId, [raw, agreed]] of Object.entries(marks)) {
    docMarks.push({ studentId, rawTotal: raw, rubricMax: 100, markedBy: 'u-mahlalela',
                    moderatedBy: 'u-sdlamini', agreedRawTotal: agreed });
  }
}

if (!tables.seeded) {
  tables.seeded = true;
  seedConsultations();
  seedSheets();
  seedDocMarks();
  seedTopics();
  seedSlots();
  seedSchedule();
}

function seedSchedule(): void {
  // The dates the department already works to, previously living in a Word
  // document. Times matter: "Friday" is not a deadline.
  const plan: Array<[string, string, string, number]> = [
    ['proposal', 'Proposal and topic agreement', '2025-09-26T16:00:00+02:00', 60],
    ['chapters-1-2', 'Chapters 1 and 2 submitted to supervisor', '2025-11-14T16:00:00+02:00', 60],
    ['ethics', 'Ethics clearance where required', '2026-02-06T16:00:00+02:00', 0],
    ['artefact', 'Artefact and implementation walkthrough', '2026-04-24T16:00:00+02:00', 60],
    ['documentation', 'Final documentation, bound and uploaded', '2026-05-15T12:00:00+02:00', 0],
  ];
  for (const [key, label, dueAt, graceMinutes] of plan) {
    deadlines.push({
      id: `dl-20252026-${key}`, cycleId: CYCLE, key, label,
      dueAt: new Date(dueAt).toISOString(), graceMinutes, published: true, note: '',
    });
  }

  // One student repeating the project with a presentation already credited,
  // so the carried-credit path is exercised by the seed rather than only by
  // the tests.
  enrolments.push({
    studentId: 's8', status: 'CARRY_OVER', effectiveFrom: '2025-08-01',
    note: 'Repeating CSC 499 after deferring documentation in 2024/2025. P1 credited by the board.',
    decidedBy: null, decidedAt: '2025-08-04T09:00:00Z',
    carried: [{ componentKey: 'P1', percentage: 68, fromCycleId: '2024/2025', ref: 'BoE 2025-07-11 item 4.2' }],
  });
}

// The working tables are hydrated from Postgres (if a snapshot exists) by
// ensureHydrated(), which the root layout awaits before rendering any page.
// The in-memory seed above is the fallback when no snapshot exists yet.

/* --------------------------------------------------------------- accessors */

export const allPeople = (): Person[] => [...PEOPLE, ...studentAccounts(), ...REGISTERED_STAFF];
export const findPerson = (id: string) => allPeople().find((p) => p.id === id) ?? null;
export const findPersonByUsername = (u: string) => allPeople().find((p) => p.username === u) ?? null;
export const findStudent = (id: string) => STUDENTS.find((s) => s.id === id) ?? null;
export const findStudentByNumber = (n: string) => STUDENTS.find((s) => s.studentNumber === n) ?? null;
export const findProject = (id: string) => PROJECTS.find((p) => p.id === id) ?? null;
export const projectOf = (studentId: string) => {
  const st = findStudent(studentId);
  return st ? findProject(st.projectId) : null;
};
export const superviseesOf = (supervisorId: string): Student[] =>
  STUDENTS.filter((s) => findProject(s.projectId)?.supervisorId === supervisorId);

export const consultationsOf = (studentId: string): Consultation[] =>
  consultations.filter((c) => c.studentId === studentId);

export const sheetsFor = (studentId: string, component: 'p1' | 'p2'): Sheet[] =>
  sheets.filter((s) => s.studentId === studentId && s.component === component);

export const sheetOf = (assessorId: string, studentId: string, component: 'p1' | 'p2'): Sheet | null =>
  sheets.find((s) => s.assessorId === assessorId && s.studentId === studentId && s.component === component) ?? null;

export const docMarkOf = (studentId: string) => docMarks.find((d) => d.studentId === studentId) ?? null;

/**
 * Session lists for an assessor.
 *
 * A deferred or withdrawn student is dropped here rather than in the screen,
 * so no route can schedule, present or mark someone who is not being assessed
 * this cycle. A slot left with nobody in it disappears with them.
 */
export const sessionsFor = (component: 'p1' | 'p2'): SessionSlot[] =>
  SESSIONS.filter((s) => s.component === component)
    .map((s) => {
      const studentIds = s.studentIds.filter((id) => isStudentAssessable(id));
      return studentIds.length === s.studentIds.length
        ? s
        : { ...s, studentIds, joint: s.joint && studentIds.length > 1 };
    })
    .filter((s) => s.studentIds.length > 0);

/* ---------------------------------------------------------------- mutations */

export function setMark(
  assessorId: string, studentId: string, component: 'p1' | 'p2',
  criterionId: string, value: number | null,
): { ok: true } | { ok: false; error: string } {
  const rubric = RUBRICS[component];
  const criterion = rubric.criteria.find((c) => c.id === criterionId);
  if (!criterion) return { ok: false, error: 'Unknown criterion.' };
  if (value !== null && (!Number.isInteger(value) || value < 0 || value > criterion.max)) {
    return { ok: false, error: `${criterion.label} must be a whole number between 0 and ${criterion.max}.` };
  }

  let sheet = sheetOf(assessorId, studentId, component);
  if (!sheet) {
    sheet = { assessorId, studentId, component, rubricVersionId: rubric.versionId,
              rubricMax: rubric.max, marks: {}, submitted: false, submittedAt: null };
    sheets.push(sheet);
  }
  if (sheet.submitted) return { ok: false, error: 'This sheet is submitted. A coordinator must reopen it.' };
  sheet.marks[criterionId] = value;
  // First mark against this instrument: it is no longer a draft, so any later
  // edit forks rather than rewriting the sheet these marks were awarded on.
  if (value !== null && !rubric.locked) rubric.locked = true;
  schedulePersist();
  return { ok: true };
}

/* ------------------------------------------------- assessment instruments */

/**
 * Has anything been marked against this component at all? This, not the
 * `locked` flag, is what decides whether an edit forks — the flag is a cache of
 * it for display, and a cache is not something to make a decision on.
 */
export function instrumentInUse(component: 'p1' | 'p2'): boolean {
  return sheets.some((s) => s.component === component
    && Object.values(s.marks).some((v) => v !== null));
}

/** Every criterion id this component has ever used, so none is ever reused. */
function usedCriterionIds(component: 'p1' | 'p2'): string[] {
  const ids = new Set<string>();
  for (const version of RUBRIC_VERSIONS) {
    if (version.component !== component) continue;
    for (const c of version.criteria) ids.add(c.id);
  }
  for (const sheet of sheets) {
    if (sheet.component === component) for (const id of Object.keys(sheet.marks)) ids.add(id);
  }
  return [...ids];
}

/**
 * What would happen if this edit were applied. Nothing is written. The
 * coordinator sees this before confirming, which is the whole point: an
 * instrument change is the one edit in this system that can reach backwards
 * into marks already entered.
 */
export function previewInstrumentEdit(
  component: 'p1' | 'p2', draft: Draft, byUserId: string,
): PlanResult {
  const current = activeInstrument(component);
  const relevant = sheets.filter((s) => s.component === component);
  return planChange(current, draft, relevant, new Date().toISOString(), byUserId,
                    usedCriterionIds(component));
}

/**
 * A change the coordinator has composed but not yet committed.
 *
 * Deliberately not persisted: a half-finished instrument edit surviving a
 * restart is a trap, not a convenience. It lives only as long as the process
 * and is cleared the moment the change is applied or abandoned.
 */
const globalForPending = globalThis as unknown as { __upsasPendingEdits?: Map<string, Draft> };
const pendingEdits: Map<string, Draft> = (globalForPending.__upsasPendingEdits ??= new Map());
const pendingKey = (userId: string, component: 'p1' | 'p2') => `${userId}:${component}`;

export function readPendingEdit(userId: string, component: 'p1' | 'p2'): Draft | null {
  return pendingEdits.get(pendingKey(userId, component)) ?? null;
}
export function writePendingEdit(userId: string, component: 'p1' | 'p2', draft: Draft): void {
  pendingEdits.set(pendingKey(userId, component), draft);
}
export function clearPendingEdit(userId: string, component: 'p1' | 'p2'): void {
  pendingEdits.delete(pendingKey(userId, component));
}

export interface AppliedEdit {
  plan: ChangePlan;
  summary: string;
}

/**
 * Apply the edit. Forks when marks exist, edits in place when they do not, and
 * refuses a fork with consequences unless the coordinator has acknowledged
 * them. Signed sheets are never touched.
 */
export function applyInstrumentEdit(
  component: 'p1' | 'p2', draft: Draft, byUserId: string, acknowledged: boolean,
): { ok: true; applied: AppliedEdit } | { ok: false; errors: string[] } {
  const result = previewInstrumentEdit(component, draft, byUserId);
  if (!result.ok) return result;
  const { plan } = result;

  if (plan.requiresAcknowledgement && !acknowledged) {
    return { ok: false, errors: ['Confirm you have read what this change does to marks already entered.'] };
  }

  const current = activeInstrument(component);

  if (plan.mode === 'in-place') {
    current.title = plan.next.title;
    current.criteria = plan.next.criteria;
    current.max = plan.next.max;
    current.note = plan.next.note;
    current.createdAt = plan.next.createdAt;
    current.createdBy = byUserId;
  } else {
    current.supersededBy = plan.next.versionId;
    // Marks move with the open sheets, so the new version is in use from the
    // moment it is published and its own next edit forks again.
    plan.next.locked = plan.marksCleared.length < plan.sheetsMigrated || plan.sheetsMigrated > 0;
    RUBRIC_VERSIONS.push(plan.next);
    // Open sheets follow the instrument; signed sheets stay where they were.
    for (const sheet of sheets) {
      if (sheet.component !== component) continue;
      if (sheet.rubricVersionId !== current.versionId) continue;
      if (sheet.submitted) continue;
      migrateSheet(sheet, plan.next);
    }
  }

  schedulePersist();
  return { ok: true, applied: { plan, summary: describePlan(plan) } };
}

export function gradeConsultation(
  id: string, rawTotal: number | null, byUserId: string,
): { ok: true } | { ok: false; error: string } {
  const c = consultations.find((x) => x.id === id);
  if (!c) return { ok: false, error: 'No such consultation.' };
  if (c.status !== 'COMPLETED') return { ok: false, error: 'Only a completed session can be graded.' };
  if (rawTotal !== null && (!Number.isInteger(rawTotal) || rawTotal < 0 || rawTotal > c.rubricMax)) {
    return { ok: false, error: `Mark must be a whole number between 0 and ${c.rubricMax}.` };
  }
  c.rawTotal = rawTotal;
  void byUserId;
  schedulePersist();
  return { ok: true };
}

export function attestConsultation(id: string, role: 'SUPERVISOR' | 'STUDENT'): void {
  const c = consultations.find((x) => x.id === id);
  if (!c) return;
  if (role === 'SUPERVISOR') c.supervisorAttested = true; else c.studentAttested = true;
  schedulePersist();
}

export function addConsultation(studentId: string, periodId: 'SEM1' | 'SEM2', agenda: string): Consultation {
  const c: Consultation = {
    id: `${studentId}-${periodId}-${Date.now()}`, studentId, periodId,
    heldAt: new Date().toISOString(), status: 'COMPLETED',
    supervisorAttested: false, studentAttested: false, rawTotal: null, rubricMax: 100, agenda,
  };
  consultations.push(c);
  return c;
}

export function submitSheet(assessorId: string, component: 'p1' | 'p2', at: string): number {
  let count = 0;
  for (const s of sheets) {
    if (s.assessorId === assessorId && s.component === component && !s.submitted) {
      s.submitted = true;
      s.submittedAt = at;
      count += 1;
    }
  }
  schedulePersist();
  return count;
}

/* ------------------------------------------------------------------ topics */

export const allTopics = () => topics.filter((t) => t.published || t.studentProposed);
export const topicsBySupervisor = (supervisorId: string) => topics.filter((t) => t.supervisorId === supervisorId);
export const findTopic = (id: string) => topics.find((t) => t.id === id) ?? null;
export const preferencesOf = (studentId: string) =>
  preferences.filter((p) => p.studentId === studentId).sort((a, b) => a.rank - b.rank);
export const preferencesForTopic = (topicId: string) => preferences.filter((p) => p.topicId === topicId);

/** Supervision capacity counts students across all of a supervisor's topics. */
export const loadOf = (supervisorId: string) =>
  PROJECTS.filter((p) => p.supervisorId === supervisorId)
    .reduce((a, p) => a + p.memberIds.length, 0);

export const CAPACITY = 8;

export function addTopic(
  supervisorId: string, title: string, description: string,
  prerequisites: string, capacity: number, groupSuitable: boolean,
): { ok: true; id: string } | { ok: false; error: string } {
  if (title.trim().length < 10) return { ok: false, error: 'Give the topic a real title — at least ten characters.' };
  if (description.trim().length < 30) {
    return { ok: false, error: 'Describe the work in at least a couple of sentences; students choose on this text.' };
  }
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 6) {
    return { ok: false, error: 'Capacity must be between 1 and 6 students.' };
  }
  const id = `t-${topics.length + 1}-${Date.now()}`;
  topics.push({
    id, supervisorId, title: title.trim(), description: description.trim(),
    prerequisites: prerequisites.trim(), tags: [], capacity, groupSuitable,
    published: true, studentProposed: false, proposedBy: null, acceptedAt: null,
  });
  schedulePersist();
  return { ok: true, id };
}

export function bulkAddTopics(supervisorId: string, text: string): { added: number; skipped: number } {
  let added = 0, skipped = 0;
  for (const line of text.split('\n')) {
    const parts = line.split('|').map((x) => x.trim());
    if (parts.length < 2 || !parts[0] || !parts[1]) { if (line.trim()) skipped += 1; continue; }
    const cap = Number(parts[2] ?? '1');
    const r = addTopic(supervisorId, parts[0], parts[1], parts[3] ?? '',
                       Number.isInteger(cap) && cap > 0 ? cap : 1, true);
    if (r.ok) added += 1; else skipped += 1;
  }
  return { added, skipped };
}

export function proposeTopic(
  studentId: string, supervisorId: string, title: string, description: string,
): { ok: true } | { ok: false; error: string } {
  if (title.trim().length < 10 || description.trim().length < 30) {
    return { ok: false, error: 'A proposal needs a real title and a description of at least a couple of sentences.' };
  }
  topics.push({
    id: `t-prop-${Date.now()}`, supervisorId, title: title.trim(), description: description.trim(),
    prerequisites: '', tags: [], capacity: 1, groupSuitable: true,
    published: false, studentProposed: true, proposedBy: studentId, acceptedAt: null,
  });
  schedulePersist();
  return { ok: true };
}

export function acceptProposal(topicId: string, supervisorId: string): { ok: true } | { ok: false; error: string } {
  const t = findTopic(topicId);
  if (!t || !t.studentProposed) return { ok: false, error: 'No such proposal.' };
  if (t.supervisorId !== supervisorId) return { ok: false, error: 'That proposal was not sent to you.' };
  if (loadOf(supervisorId) >= CAPACITY) return { ok: false, error: 'You are at capacity.' };
  t.acceptedAt = new Date().toISOString();
  t.published = true;
  schedulePersist();
  return { ok: true };
}

export function setPreferences(studentId: string, topicIds: string[]): { ok: true } | { ok: false; error: string } {
  const chosen = topicIds.filter(Boolean);
  if (new Set(chosen).size !== chosen.length) return { ok: false, error: 'Choose three different topics.' };
  if (chosen.length === 0) return { ok: false, error: 'Pick at least one topic.' };
  for (let i = preferences.length - 1; i >= 0; i -= 1) {
    if (preferences[i]!.studentId === studentId) preferences.splice(i, 1);
  }
  chosen.forEach((topicId, i) => preferences.push({ studentId, topicId, rank: i + 1 }));
  schedulePersist();
  return { ok: true };
}

/**
 * Deterministic preference-matching allocation. Each unallocated student is
 * placed onto their highest-ranked topic whose supervisor still has capacity
 * and whose topic capacity is not yet full. Students who cannot be placed are
 * returned as unmatched for manual placement by the coordinator.
 */
export function runAllocation(): {
  assigned: Array<{ studentId: string; studentNumber: string; topicId: string; title: string; supervisorId: string }>;
  unmatched: Array<{ studentId: string; studentNumber: string }>;
} {
  const assigned: Array<{ studentId: string; studentNumber: string; topicId: string; title: string; supervisorId: string }> = [];
  const unmatched: Array<{ studentId: string; studentNumber: string }> = [];

  const takenOnTopic = (topicId: string) =>
    PROJECTS.filter((p) => p.topicId === topicId).reduce((a, p) => a + p.memberIds.length, 0);

  // Deterministic order: student number ascending.
  const queue = unallocatedStudents().slice().sort((a, b) => a.studentNumber.localeCompare(b.studentNumber));

  for (const student of queue) {
    const prefs = preferencesOf(student.id);
    let placed = false;
    for (const pref of prefs) {
      const topic = findTopic(pref.topicId);
      if (!topic || !topic.published) continue;
      if (loadOf(topic.supervisorId) >= CAPACITY) continue;
      if (takenOnTopic(topic.id) >= topic.capacity) continue;

      const projectId = `p-alloc-${student.id}-${Date.now().toString(36)}`;
      PROJECTS.push({
        id: projectId,
        title: topic.title,
        supervisorId: topic.supervisorId,
        memberIds: [student.id],
        state: 'TOPIC_SELECTED',
        ethicsStatus: 'NOT_REQUIRED',
        contributionFiled: { [student.id]: false },
        topicId: topic.id,
      });
      student.projectId = projectId;
      assigned.push({
        studentId: student.id,
        studentNumber: student.studentNumber,
        topicId: topic.id,
        title: topic.title,
        supervisorId: topic.supervisorId,
      });
      placed = true;
      break;
    }
    if (!placed) {
      unmatched.push({ studentId: student.id, studentNumber: student.studentNumber });
    }
  }

  schedulePersist();
  return { assigned, unmatched };
}

/* --------------------------------------------------------------- booking */

export const slotsOf = (supervisorId: string) =>
  slots.filter((s) => s.supervisorId === supervisorId).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
export const openSlotsFor = (supervisorId: string, from: string) =>
  slotsOf(supervisorId).filter((s) => s.bookedByStudentId === null && s.startsAt > from);
export const bookingsOf = (studentId: string) =>
  slots.filter((s) => s.bookedByStudentId === studentId).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
export const findSlot = (id: string) => slots.find((s) => s.id === id) ?? null;

export const MIN_NOTICE_HOURS = 24;

/* ------------------------------------------------------- meeting notices */

/** A student's login, which is not always `u-<studentId>` for registered students. */
function personIdForStudent(studentId: string): string {
  return allPeople().find((p) => p.studentId === studentId)?.id ?? `u-${studentId}`;
}

function studentName(studentId: string): string {
  const st = findStudent(studentId);
  return st ? `${st.otherNames} ${st.surname}` : 'A student';
}

function staffName(personId: string): string {
  return findPerson(personId)?.fullName ?? 'Your supervisor';
}

function where(slot: Slot): string {
  return slot.mode === 'ONLINE'
    ? (slot.meetingLink ? `online — ${slot.meetingLink}` : 'online')
    : (slot.venue || 'in person');
}

/**
 * Tell both people about a change to one meeting, retiring whatever either of
 * them was previously told about it.
 */
function announce(
  meetingRef: string, startsAt: string | null,
  notices: Array<{ forUserId: string; kind: NoticeKind; title: string; body: string; actionRequired?: boolean; href: string }>,
): void {
  const now = new Date();
  supersede(meetingNotices, meetingRef, now);
  const created: MeetingNotice[] = [];
  for (const n of notices) {
    const notice = makeNotice({
      forUserId: n.forUserId, meetingRef, kind: n.kind, title: n.title, body: n.body,
      startsAt, actionRequired: n.actionRequired ?? false, href: n.href,
    }, now);
    meetingNotices.push(notice);
    created.push(notice);
  }
  emailNotices(created);
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Where to email someone. A coordinator-set address wins, then whatever the
 * account was registered with. Seeded accounts have none until one is set.
 */
export function emailOf(userId: string): string | null {
  const set = tables.contactEmails[userId];
  if (set) return set;
  return findPerson(userId)?.email ?? null;
}

export function setContactEmail(userId: string, email: string): { ok: true } | { ok: false; error: string } {
  if (!findPerson(userId)) return { ok: false, error: 'No such account.' };
  const value = email.trim().toLowerCase();
  if (value && !EMAIL_PATTERN.test(value)) return { ok: false, error: 'That email address does not look right.' };
  if (value) tables.contactEmails[userId] = value; else delete tables.contactEmails[userId];
  schedulePersist();
  return { ok: true };
}

/** Student names are stored "Surname, Other names"; a greeting wants them the other way round. */
function displayName(fullName: string): string {
  const [surname, rest] = fullName.split(',').map((part) => part.trim());
  return rest ? `${rest} ${surname}` : fullName;
}

/** The public address of this deployment, for links in email. */
function appUrl(): string {
  return (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

/**
 * Send each new notice by email as well, through the same event that raised
 * the banner and rang the bell, so the two channels cannot disagree.
 *
 * Replies go to the other person in the meeting: a student answering "can we
 * make it 14:30?" reaches their supervisor, not a no-reply address. Sending is
 * fire-and-forget — a slow or failing mail service must never make a booking
 * fail — and anyone without an address on file is simply skipped.
 */
function emailNotices(notices: MeetingNotice[]): void {
  for (const notice of notices) {
    const person = findPerson(notice.forUserId);
    const to = emailOf(notice.forUserId);
    if (!person || !to) continue;
    const counterpart = notices.find((other) => other.forUserId !== notice.forUserId);
    const replyTo = counterpart ? emailOf(counterpart.forUserId) : null;
    const openUrl = `${appUrl()}/api/notifications/${encodeURIComponent(notice.id)}/open`;
    const mail = renderNoticeEmail(notice, displayName(person.fullName), openUrl);
    void sendEmail({
      to, subject: mail.subject, body: mail.text, html: mail.html,
      ...(replyTo ? { replyTo } : {}),
    });
  }
}

export function noticesFor(userId: string, now: Date = new Date()): MeetingNotice[] {
  return visibleFor(meetingNotices, userId, now);
}

export function recentNoticesFor(userId: string, now: Date = new Date()): MeetingNotice[] {
  return recentlySeen(meetingNotices, userId, now);
}

/**
 * Open a notice from the bell: mark it read and say where to go. Anyone else's
 * notice id is treated as unknown rather than confirmed to exist.
 */
export function openNotice(id: string, userId: string): string | null {
  const notice = meetingNotices.find((n) => n.id === id && n.forUserId === userId);
  if (!notice) return null;
  if (!notice.seenAt) {
    notice.seenAt = new Date().toISOString();
    schedulePersist();
  }
  return hrefOf(notice);
}

export function dismissNotice(id: string, userId: string): boolean {
  const done = dismiss(meetingNotices, id, userId, new Date());
  if (done) schedulePersist();
  return done;
}

export function dismissAllNotices(userId: string): number {
  const count = dismissAll(meetingNotices, userId, new Date());
  if (count) schedulePersist();
  return count;
}

export function bookSlot(
  slotId: string, studentId: string, agenda: string, now: Date,
  mode: 'IN_PERSON' | 'ONLINE' = 'IN_PERSON', meetingLink = '',
): { ok: true } | { ok: false; error: string } {
  const slot = findSlot(slotId);
  if (!slot) return { ok: false, error: 'No such slot.' };
  if (slot.bookedByStudentId !== null) {
    return { ok: false, error: 'Someone booked that slot first. Pick another.' };
  }
  const hours = (new Date(slot.startsAt).getTime() - now.getTime()) / 3_600_000;
  if (hours < MIN_NOTICE_HOURS) {
    return { ok: false, error: `Slots need ${MIN_NOTICE_HOURS} hours' notice. Ask your supervisor directly for anything sooner.` };
  }
  const project = projectOf(studentId);
  if (project && project.supervisorId !== slot.supervisorId) {
    return { ok: false, error: 'You can only book with your own supervisor.' };
  }
  if (bookingsOf(studentId).some((s) => s.startsAt.slice(0, 10) === slot.startsAt.slice(0, 10))) {
    return { ok: false, error: 'You already have a session booked that day.' };
  }
  slot.bookedByStudentId = studentId;
  slot.agenda = agenda.trim() || 'Consultation';
  slot.mode = mode;
  slot.meetingLink = meetingLink.trim() || null;
  slot.status = 'REQUESTED';
  const when = whenLabel(slot.startsAt);
  announce(slot.id, slot.startsAt, [
    {
      forUserId: slot.supervisorId, kind: 'BOOKED', actionRequired: true,
      href: `/book?focus=${slot.id}#slot-${slot.id}`,
      title: `${studentName(studentId)} booked ${when}`,
      body: `${slot.agenda} · ${where(slot)}. Confirm or decline it under My availability.`,
    },
    {
      forUserId: personIdForStudent(studentId), kind: 'REQUESTED',
      href: `/book?focus=${slot.id}#booking-${slot.id}`,
      title: `Booking sent for ${when}`,
      body: `With ${staffName(slot.supervisorId)} · ${where(slot)}. It is not confirmed until they accept it.`,
    },
  ]);
  schedulePersist();
  return { ok: true };
}

/** Supervisor confirms a pending booking. */
export function confirmBooking(slotId: string, supervisorId: string): { ok: true } | { ok: false; error: string } {
  const slot = findSlot(slotId);
  if (!slot) return { ok: false, error: 'No such slot.' };
  if (slot.supervisorId !== supervisorId) return { ok: false, error: 'Not your slot.' };
  if (!slot.bookedByStudentId) return { ok: false, error: 'No booking on this slot.' };
  slot.status = 'CONFIRMED';
  const confirmedWhen = whenLabel(slot.startsAt);
  announce(slot.id, slot.startsAt, [
    {
      forUserId: personIdForStudent(slot.bookedByStudentId), kind: 'CONFIRMED',
      href: `/book?focus=${slot.id}#booking-${slot.id}`,
      title: `Confirmed: ${confirmedWhen}`,
      body: `${staffName(slot.supervisorId)} confirmed your consultation · ${where(slot)}.`,
    },
    {
      forUserId: slot.supervisorId, kind: 'CONFIRMED',
      href: `/book?focus=${slot.id}#slot-${slot.id}`,
      title: `Confirmed: ${studentName(slot.bookedByStudentId)}, ${confirmedWhen}`,
      body: `${slot.agenda ?? 'Consultation'} · ${where(slot)}. The student has been told.`,
    },
  ]);
  schedulePersist();
  return { ok: true };
}

/** Supervisor declines a pending booking, returning the slot to open. */
export function declineBooking(slotId: string, supervisorId: string): { ok: true } | { ok: false; error: string } {
  const slot = findSlot(slotId);
  if (!slot) return { ok: false, error: 'No such slot.' };
  if (slot.supervisorId !== supervisorId) return { ok: false, error: 'Not your slot.' };
  if (!slot.bookedByStudentId) return { ok: false, error: 'No booking on this slot.' };
  const declinedWhen = whenLabel(slot.startsAt);
  announce(slot.id, slot.startsAt, [
    {
      forUserId: personIdForStudent(slot.bookedByStudentId), kind: 'DECLINED', actionRequired: true,
      href: '/book#open-slots',
      title: `Not accepted: ${declinedWhen}`,
      body: `${staffName(slot.supervisorId)} could not take this slot. Book another time.`,
    },
    {
      forUserId: slot.supervisorId, kind: 'DECLINED',
      href: `/book?focus=${slot.id}#slot-${slot.id}`,
      title: `You declined ${studentName(slot.bookedByStudentId)}, ${declinedWhen}`,
      body: 'The slot is open again and the student has been told.',
    },
  ]);
  slot.bookedByStudentId = null;
  slot.agenda = null;
  slot.status = undefined;
  slot.meetingLink = null;
  schedulePersist();
  return { ok: true };
}

export function cancelBooking(slotId: string, studentId: string, now: Date): { ok: true } | { ok: false; error: string } {
  const slot = findSlot(slotId);
  if (!slot || slot.bookedByStudentId !== studentId) return { ok: false, error: 'That booking is not yours.' };
  const hours = (new Date(slot.startsAt).getTime() - now.getTime()) / 3_600_000;
  if (hours < MIN_NOTICE_HOURS) {
    return { ok: false, error: `Cancelling inside ${MIN_NOTICE_HOURS} hours is recorded as a missed session. Speak to your supervisor.` };
  }
  const cancelledWhen = whenLabel(slot.startsAt);
  announce(slot.id, slot.startsAt, [
    {
      forUserId: slot.supervisorId, kind: 'CANCELLED',
      href: `/book?focus=${slot.id}#slot-${slot.id}`,
      title: `Cancelled: ${studentName(studentId)}, ${cancelledWhen}`,
      body: 'The student cancelled with enough notice. The slot is open again.',
    },
    {
      forUserId: personIdForStudent(studentId), kind: 'CANCELLED',
      href: '/book#open-slots',
      title: `You cancelled ${cancelledWhen}`,
      body: `${staffName(slot.supervisorId)} has been told.`,
    },
  ]);
  slot.bookedByStudentId = null;
  slot.agenda = null;
  // Without these a reopened slot kept the last booking's state and link.
  slot.status = undefined;
  slot.meetingLink = null;
  schedulePersist();
  return { ok: true };
}

export function addSlots(
  supervisorId: string, date: string, hours: string[], mode: 'IN_PERSON' | 'ONLINE', venue: string,
): number {
  let added = 0;
  for (const h of hours) {
    const startsAt = new Date(`${date}T${h}:00:00Z`).toISOString();
    if (slots.some((s) => s.supervisorId === supervisorId && s.startsAt === startsAt)) continue;
    slots.push({
      id: `slot-${Date.now()}-${added}`, supervisorId, startsAt, minutes: 30,
      mode, venue, bookedByStudentId: null, agenda: null,
    });
    added += 1;
  }
  schedulePersist();
  return added;
}

export const publicationOf = (studentId: string) =>
  [...publications].reverse().find((p) => p.studentId === studentId) ?? null;

export const moderationOf = (studentId: string, component: 'p1' | 'p2') =>
  moderations.find((m) => m.studentId === studentId && m.component === component) ?? null;

export function recordModeration(
  studentId: string, component: 'p1' | 'p2', moderatorId: string,
  agreedPercentage: number, rationale: string,
): { ok: true } | { ok: false; error: string } {
  if (!(agreedPercentage >= 0 && agreedPercentage <= 100)) {
    return { ok: false, error: 'Agreed percentage must be between 0 and 100.' };
  }
  if (rationale.trim().length < 10) {
    return { ok: false, error: 'A moderation must record why, in at least a sentence.' };
  }
  const existing = moderations.findIndex((m) => m.studentId === studentId && m.component === component);
  const row: ModerationRow = {
    studentId, component, moderatorId, rationale: rationale.trim(),
    agreedPercentage, moderatedAt: new Date().toISOString(),
  };
  if (existing >= 0) moderations[existing] = row; else moderations.push(row);
  schedulePersist();
  return { ok: true };
}

/** Publication is append-only: a correction supersedes, it never overwrites. */
export function publish(
  studentId: string, finalMark: number | null, grade: string | null,
  publishedBy: string, reason: string | null,
): Publication {
  const previous = publicationOf(studentId);
  const row: Publication = {
    studentId, finalMark, grade, publishedBy, publishedAt: new Date().toISOString(),
    supersedes: previous ? previous.publishedAt : null, reason,
  };
  publications.push(row);
  schedulePersist();
  // Grade released — notify the student (best-effort).
  const releasedPerson = findPerson(personIdForStudent(studentId));
  const releasedBody = `Your final mark has been released: ${finalMark ?? '—'}${grade ? ` (${grade})` : ''}.`;
  void notifyUser(
    personIdForStudent(studentId),
    'grade_released',
    'Result released',
    releasedBody,
    (() => {
      const to = releasedPerson ? emailOf(releasedPerson.id) : null;
      return to ? { to, subject: 'Result released', body: releasedBody } : undefined;
    })(),
  );
  return row;
}

/* ------------------------------------------- adapters into the pure engine */

export function toConsultationRecords(studentId: string): ConsultationRecord[] {
  return consultationsOf(studentId).map((c) => ({
    id: c.id, periodId: c.periodId, status: c.status,
    supervisorAttested: c.supervisorAttested, studentAttested: c.studentAttested,
    score: c.rawTotal === null ? null : (c.rawTotal / c.rubricMax) * 100,
  }));
}

export function toAssessorEntries(studentId: string, component: 'p1' | 'p2'): AssessorEntry[] {
  return sheetsFor(studentId, component).map((s) => ({
    assessorId: s.assessorId, rubricVersionId: s.rubricVersionId, rubricMax: s.rubricMax,
    criterionScores: s.marks, submitted: s.submitted,
    isSupervisor: projectOf(studentId)?.supervisorId === s.assessorId,
  }));
}

export function rawTotalOf(sheet: Sheet | null): number | null {
  if (!sheet) return null;
  const values = Object.values(sheet.marks).filter((v): v is number => v !== null && v !== undefined);
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0);
}

/* ------------------------------------------------------------ registration */

/** Nine digits, matching the observed student-number form (2022xxxxx). */
export const STUDENT_NUMBER_PATTERN = /^\d{9}$/;
export const PROGRAMMES = ['BSc', 'BSc Information Technology', 'BSc Computer Science Education', 'BSc Library and Information Science'] as const;
export const COURSES = ['CSC 400', 'CSC 402', 'CSC 499'] as const;

/** The password hash for a username — a registered account's own, or the demo
 *  hash for seeded accounts. */
export function passwordHashFor(username: string): Promise<string> {
  const stored = tables.passwords[username];
  return stored ? Promise.resolve(stored) : demoPasswordHash();
}

export async function registerStudent(input: {
  studentNumber: string; surname: string; otherNames: string; programme: string;
  courseCode: string; email: string; password: string;
}): Promise<{ ok: true; username: string } | { ok: false; error: string }> {
  const number = input.studentNumber.trim();
  if (!STUDENT_NUMBER_PATTERN.test(number)) {
    return { ok: false, error: 'Student number must be nine digits, e.g. 202500123.' };
  }
  if (findStudentByNumber(number) || findPersonByUsername(number)) {
    return { ok: false, error: 'A student with that number already has an account.' };
  }
  if (!input.surname.trim() || !input.otherNames.trim()) {
    return { ok: false, error: 'Enter your surname and given names.' };
  }
  const passwordCheck = checkPassword(input.password, [input.surname, input.otherNames, number]);
  if (!passwordCheck.ok) return { ok: false, error: passwordCheck.problems.join(' ') };
  if (input.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim())) {
    return { ok: false, error: 'That email address does not look right.' };
  }

  STUDENTS.push({
    id: `s-${number}`, studentNumber: number, surname: input.surname.trim(), otherNames: input.otherNames.trim(),
    programme: input.programme || PROGRAMMES[0], courseCode: input.courseCode || COURSES[0],
    projectId: 'unallocated',
    // Previously validated and then dropped, so no registered student could
    // ever receive an email from the system.
    ...(input.email.trim() ? { email: input.email.trim().toLowerCase() } : {}),
  });
  tables.passwords[number] = await hashPassword(input.password);
  schedulePersist();
  return { ok: true, username: number };
}

export function requestStaffAccount(input: {
  username: string; fullName: string; email: string;
  requestedRoles: Array<RoleGrant['role']>; justification: string;
}): { ok: true } | { ok: false; error: string } {
  const username = input.username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    return { ok: false, error: 'Username must be 3–32 letters, digits, dots, dashes or underscores.' };
  }
  if (findPersonByUsername(username)) return { ok: false, error: 'That username is taken.' };
  if (!input.fullName.trim()) return { ok: false, error: 'Enter your full name.' };
  if (input.requestedRoles.length === 0) return { ok: false, error: 'Pick at least one role.' };
  if (input.justification.trim().length < 10) {
    return { ok: false, error: 'Explain why you need access in at least a sentence.' };
  }
  REGISTERED_STAFF.push({
    id: `staff-${username}`, username, fullName: input.fullName.trim(), surname: input.fullName.trim(),
    grants: [], totpConfirmed: false, status: 'PENDING_APPROVAL',
    email: input.email.trim(), requestedRoles: input.requestedRoles,
  });
  schedulePersist();
  return { ok: true };
}

export const pendingStaffRequests = () => REGISTERED_STAFF.filter((p) => p.status === 'PENDING_APPROVAL');

export function approveStaffAccount(id: string): { ok: true } | { ok: false; error: string } {
  const p = REGISTERED_STAFF.find((x) => x.id === id);
  if (!p) return { ok: false, error: 'No such request.' };
  p.status = 'ACTIVE';
  p.grants = (p.requestedRoles ?? []).map((role) => grant(role));
  schedulePersist();
  return { ok: true };
}

export function declineStaffAccount(id: string): { ok: true } | { ok: false; error: string } {
  const p = REGISTERED_STAFF.find((x) => x.id === id);
  if (!p) return { ok: false, error: 'No such request.' };
  p.status = 'DEACTIVATED';
  schedulePersist();
  return { ok: true };
}

/* --------------------------------------------------- meeting requests */

export function requestMeeting(input: {
  studentId: string; supervisorId: string; agenda: string; preferredTimes: string;
}): { ok: true } | { ok: false; error: string } {
  if (input.agenda.trim().length < 5) return { ok: false, error: 'Say what you want to cover.' };
  if (input.preferredTimes.trim().length < 3) return { ok: false, error: 'Suggest at least one time.' };
  meetingRequests.push({
    id: `mr-${Date.now()}`, studentId: input.studentId, supervisorId: input.supervisorId,
    agenda: input.agenda.trim(), preferredTimes: input.preferredTimes.trim(),
    status: 'PENDING', requestedAt: new Date().toISOString(), decidedAt: null,
  });
  const request = meetingRequests[meetingRequests.length - 1]!;
  announce(request.id, null, [
    {
      forUserId: input.supervisorId, kind: 'BOOKED', actionRequired: true,
      href: `/book?focus=${request.id}#request-${request.id}`,
      title: `${studentName(input.studentId)} asked for a meeting`,
      body: `${request.agenda} · suggests ${request.preferredTimes}. Approve or decline it.`,
    },
    {
      forUserId: personIdForStudent(input.studentId), kind: 'REQUESTED',
      href: `/book?focus=${request.id}#request-${request.id}`,
      title: 'Meeting request sent',
      body: `${staffName(input.supervisorId)} will approve or decline it.`,
    },
  ]);
  schedulePersist();
  return { ok: true };
}

export const meetingRequestsFor = (supervisorId: string) =>
  meetingRequests.filter((m) => m.supervisorId === supervisorId);
export const myMeetingRequests = (studentId: string) =>
  meetingRequests.filter((m) => m.studentId === studentId);

export function decideMeetingRequest(id: string, decision: 'APPROVED' | 'DECLINED'): { ok: true } | { ok: false; error: string } {
  const m = meetingRequests.find((x) => x.id === id);
  if (!m) return { ok: false, error: 'No such request.' };
  m.status = decision;
  m.decidedAt = new Date().toISOString();
  const approved = decision === 'APPROVED';
  announce(m.id, null, [
    {
      forUserId: personIdForStudent(m.studentId), kind: approved ? 'CONFIRMED' : 'DECLINED',
      actionRequired: !approved,
      href: approved ? `/book?focus=${m.id}#request-${m.id}` : '/book#open-slots',
      title: approved ? 'Meeting request accepted' : 'Meeting request not accepted',
      body: approved
        ? `${staffName(m.supervisorId)} accepted your request (${m.preferredTimes}). Watch for the time.`
        : `${staffName(m.supervisorId)} could not meet at those times. Book an open slot instead.`,
    },
    {
      forUserId: m.supervisorId, kind: approved ? 'CONFIRMED' : 'DECLINED',
      href: `/book?focus=${m.id}#request-${m.id}`,
      title: `${approved ? 'Accepted' : 'Declined'}: ${studentName(m.studentId)}'s meeting request`,
      body: `${m.agenda} · the student has been told.`,
    },
  ]);
  schedulePersist();
  return { ok: true };
}

/* ------------------------------------------------------ agreement signing */

export const signaturesFor = (projectId: string): AgreementSignature[] =>
  signatures.filter((s) => s.projectId === projectId);

export function signAgreement(
  projectId: string, signerId: string, name: string,
  role: AgreementSignature['role'],
): { ok: true } | { ok: false; error: string } {
  const project = findProject(projectId);
  if (!project) return { ok: false, error: 'No such project.' };
  const existing = signatures.find((s) => s.projectId === projectId && s.signerId === signerId);
  if (existing) return { ok: false, error: 'You have already signed this agreement.' };
  signatures.push({
    id: `sig-${projectId}-${signerId}-${Date.now().toString(36)}`,
    projectId, signerId, name: name.trim(), role,
    signedAt: new Date().toISOString(),
  });
  schedulePersist();
  return { ok: true };
}

/* ------------------------------------------------------- deliverables */

export const deliverablesFor = (projectId: string): DeliverableRecord[] =>
  deliverables
    .filter((d) => d.projectId === projectId)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

export function uploadDeliverable(input: {
  projectId: string;
  kind: string;
  title: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
  scanStatus: DeliverableRecord['scanStatus'];
  uploadedById: string;
}): { ok: true; id: string; version: number } | { ok: false; error: string } {
  const project = findProject(input.projectId);
  if (!project) return { ok: false, error: 'No such project.' };
  const existing = deliverables.filter((d) => d.projectId === input.projectId && d.title === input.title.trim());
  const version = existing.length + 1;
  const id = `del-${input.projectId}-${Date.now().toString(36)}`;
  deliverables.push({
    id,
    projectId: input.projectId,
    kind: input.kind,
    title: input.title.trim(),
    version,
    mediaType: input.mediaType,
    byteSize: input.byteSize,
    sha256: input.sha256,
    scanStatus: input.scanStatus,
    uploadedById: input.uploadedById,
    uploadedAt: new Date().toISOString(),
  });
  schedulePersist();
  return { ok: true, id, version };
}

/* ------------------------------------------------------- demo credentials */

export const publicationHistory = (studentId: string) =>
  publications.filter((p) => p.studentId === studentId);

let hashed: Promise<string> | null = null;
export function demoPasswordHash(): Promise<string> {
  hashed ??= hashPassword(DEMO_PASSWORD);
  return hashed;
}


/* ------------------------------------------------ enrolment, deadlines,
                                                     account recovery */

/**
 * A student with no explicit record is active. Absence of a decision is not a
 * decision, and an ordinary cohort should not need nine hundred rows to say so.
 */
export function enrolmentOf(studentId: string): Enrolment {
  return enrolments.find((e) => e.studentId === studentId)
    ?? defaultEnrolment(studentId, CYCLE_START);
}

export const CYCLE_START = '2025-08-01';

export function nonStandardEnrolments(): Enrolment[] {
  return enrolments.filter((e) => e.status !== 'ACTIVE');
}

/** Students who are scheduled, marked and published this cycle. */
export function isStudentAssessable(studentId: string): boolean {
  return isAssessable(enrolmentOf(studentId).status);
}

export function assessableStudents(): Student[] {
  return STUDENTS.filter((st) => appearsInCohort(enrolmentOf(st.id).status));
}

export interface EnrolmentChange {
  status: EnrolmentStatus;
  effectiveFrom: string;
  note: string;
  carried: CarriedComponent[];
}

export function setEnrolment(
  studentId: string, change: EnrolmentChange, byUserId: string,
): { ok: true } | { ok: false; errors: string[] } {
  const student = findStudent(studentId);
  if (!student) return { ok: false, errors: ['No such student.'] };

  const current = enrolmentOf(studentId);
  const errors = validateChange(current, change, {
    published: publications.some((p) => p.studentId === studentId),
    hasSignedMarks: sheets.some((sh) => sh.studentId === studentId && sh.submitted),
  });
  if (errors.length) return { ok: false, errors };

  const next: Enrolment = {
    studentId,
    status: change.status,
    effectiveFrom: change.effectiveFrom,
    note: change.note.trim(),
    carried: change.carried,
    decidedBy: byUserId,
    decidedAt: new Date().toISOString(),
  };

  const index = enrolments.findIndex((e) => e.studentId === studentId);
  if (index === -1) enrolments.push(next); else enrolments[index] = next;
  schedulePersist();
  return { ok: true };
}

/* ------------------------------------------------------------- deadlines */

export function deadlinesFor(cycleId: string = CYCLE): Deadline[] {
  return deadlines.filter((d) => d.cycleId === cycleId)
    .slice().sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

export function publishedDeadlines(cycleId: string = CYCLE): Deadline[] {
  return deadlinesFor(cycleId).filter((d) => d.published);
}

export function findDeadline(key: string, cycleId: string = CYCLE): Deadline | null {
  return deadlines.find((d) => d.key === key && d.cycleId === cycleId) ?? null;
}

export function saveDeadline(
  draft: Omit<Deadline, 'id'>,
): { ok: true } | { ok: false; errors: string[] } {
  const errors = validateDeadline(draft);
  if (errors.length) return { ok: false, errors };

  const existing = deadlines.find((d) => d.key === draft.key && d.cycleId === draft.cycleId);
  if (existing) {
    Object.assign(existing, draft);
  } else {
    deadlines.push({ ...draft, id: `dl-${draft.cycleId.replace(/\W/g, '')}-${draft.key}` });
  }
  schedulePersist();
  return { ok: true };
}

export function removeDeadline(key: string, cycleId: string = CYCLE): void {
  const index = deadlines.findIndex((d) => d.key === key && d.cycleId === cycleId);
  if (index !== -1) deadlines.splice(index, 1);
  // Extensions against a deadline that no longer exists are noise.
  for (let i = extensions.length - 1; i >= 0; i -= 1) {
    if (extensions[i]!.deadlineKey === key) extensions.splice(i, 1);
  }
  schedulePersist();
}

export function extensionFor(studentId: string, deadlineKey: string): Extension | null {
  return extensions.find((e) => e.studentId === studentId && e.deadlineKey === deadlineKey) ?? null;
}

export function extensionsFor(studentId: string): Extension[] {
  return extensions.filter((e) => e.studentId === studentId);
}

export function grantExtension(
  draft: Omit<Extension, 'id' | 'approvedAt'>,
): { ok: true } | { ok: false; errors: string[] } {
  const deadline = findDeadline(draft.deadlineKey);
  const errors = validateExtension(draft, deadline);
  if (errors.length) return { ok: false, errors };

  const record: Extension = { ...draft, id: `ext-${draft.studentId}-${draft.deadlineKey}`, approvedAt: new Date().toISOString() };
  const index = extensions.findIndex((e) => e.studentId === draft.studentId && e.deadlineKey === draft.deadlineKey);
  if (index === -1) extensions.push(record); else extensions[index] = record;
  schedulePersist();
  return { ok: true };
}

export function withdrawExtension(studentId: string, deadlineKey: string): void {
  const index = extensions.findIndex((e) => e.studentId === studentId && e.deadlineKey === deadlineKey);
  if (index !== -1) extensions.splice(index, 1);
  schedulePersist();
}

/**
 * A student's view of a deadline: their date, not the standard one.
 *
 * `submittedAt` stays null until deliverable upload is built; the state machine
 * already distinguishes submitted-on-time from submitted-late, so wiring it is
 * a call site rather than a redesign.
 */
export function deadlineStatusFor(studentId: string, deadline: Deadline, now: Date = new Date()) {
  return statusOf(deadline, extensionFor(studentId, deadline.key), null, now);
}

/* ------------------------------------------------------ account recovery */

export interface IssuedReset {
  code: string;
  expiresAt: string;
}

/**
 * Issue a code for someone who cannot sign in. The coordinator reads it to
 * them; nobody, including the coordinator, learns their password.
 */
/**
 * A code is shown to the coordinator exactly once and then forgotten.
 *
 * It is handed back through here rather than through the URL, because a query
 * string ends up in browser history, in a proxy log and over the shoulder of
 * whoever is standing at the desk.
 */
const globalForCodes = globalThis as unknown as { __upsasIssuedCodes?: Map<string, IssuedReset & { forUserId: string }> };
const issuedCodes = (globalForCodes.__upsasIssuedCodes ??= new Map<string, IssuedReset & { forUserId: string }>());

export function takeIssuedCode(byUserId: string): (IssuedReset & { forUserId: string }) | null {
  const value = issuedCodes.get(byUserId) ?? null;
  issuedCodes.delete(byUserId);
  return value;
}

export function issueResetCode(userId: string, byUserId: string): IssuedReset | null {
  const person = findPerson(userId);
  if (!person) return null;

  const now = new Date();
  revokeOutstanding(resetTickets, userId, now);   // only the newest code works
  const { ticket, code } = issueTicket(userId, byUserId, now);
  resetTickets.push(ticket);
  issuedCodes.set(byUserId, { code, expiresAt: ticket.expiresAt, forUserId: userId });
  return { code, expiresAt: ticket.expiresAt };
}

export function outstandingResetFor(userId: string): ResetTicket | null {
  const iso = new Date().toISOString();
  return resetTickets.find(
    (t) => t.userId === userId && !t.usedAt && !t.revokedAt && t.expiresAt > iso,
  ) ?? null;
}

/**
 * Redeem a code and set a new password.
 *
 * The caller is responsible for ending that account's sessions afterwards: a
 * forgotten password and a stolen one are indistinguishable from here, so the
 * safe assumption is that somebody else may be signed in.
 */
export async function redeemResetCode(
  username: string, code: string, newPassword: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const person = findPersonByUsername(username.trim());
  const result = redeem(resetTickets, username, person?.id ?? null, code, new Date());
  if (!result.ok) return { ok: false, error: result.reason };
  if (!person) return { ok: false, error: result.ok ? 'Unknown account.' : '' };

  const check = checkPassword(newPassword, [person.username, person.fullName, person.email ?? '']);
  if (!check.ok) return { ok: false, error: check.problems[0] ?? 'That password is not acceptable.' };

  tables.passwords[person.username] = await hashPassword(newPassword);
  result.ticket.usedAt = new Date().toISOString();
  // A lockout survives a password change otherwise, which would leave someone
  // who has just proved who they are still locked out.
  person.status = person.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE';
  schedulePersist();
  return { ok: true, userId: person.id };
}

/* --------------------------------------------------------- persistence */

function collectState() {
  return {
    consultations: tables.consultations,
    sheets: tables.sheets,
    docMarks: tables.docMarks,
    publications: tables.publications,
    moderations: tables.moderations,
    topics: tables.topics,
    preferences: tables.preferences,
    slots: tables.slots,
    meetingRequests: tables.meetingRequests,
    signatures: tables.signatures,
    deliverables: tables.deliverables,
    passwords: tables.passwords,
    rubricVersions: RUBRIC_VERSIONS,
    enrolments: tables.enrolments,
    deadlines: tables.deadlines,
    extensions: tables.extensions,
    meetingNotices: tables.meetingNotices,
    contactEmails: tables.contactEmails,
    students: STUDENTS,
    registeredStaff: REGISTERED_STAFF,
    projects: PROJECTS,
  };
}

function replaceArray<T>(target: T[], values: unknown): void {
  if (!Array.isArray(values)) return;
  target.splice(0, target.length, ...(values as T[]));
}

let hydratePromise: Promise<void> | null = null;

/** Idempotent hydration: loads the persisted snapshot once and replaces the
 *  in-memory working tables. The root layout awaits this before rendering. */
/**
 * Where durable storage stands. `ready` is the only state in which writes are
 * allowed: until the real snapshot has been read, this process holds seed data,
 * and writing that back would overwrite every mark in the database.
 */
export type PersistenceHealth = 'disabled' | 'loading' | 'ready' | 'unreachable';

const globalForPersist = globalThis as unknown as {
  __upsasPersist?: { health: PersistenceHealth; lastError: string | null; lastSavedAt: string | null };
};
const persistState = (globalForPersist.__upsasPersist ??= {
  health: 'loading', lastError: null, lastSavedAt: null,
});

export function persistenceHealth() {
  return { ...persistState };
}

export function ensureHydrated(): Promise<void> {
  // A failed attempt is not cached: the next request tries again, so a
  // database that comes up late is picked up without a restart.
  if (persistState.health === 'unreachable') hydratePromise = null;
  hydratePromise ??= hydrateFromPersistence();
  return hydratePromise;
}

async function hydrateFromPersistence(): Promise<void> {
  const loaded = await loadPersistedState();
  if (loaded.status === 'disabled') { persistState.health = 'disabled'; return; }
  if (loaded.status === 'unreachable') {
    persistState.health = 'unreachable';
    persistState.lastError = loaded.error;
    console.error('[persist:unreachable] refusing to run on seed data:', loaded.error);
    return;
  }
  if (loaded.status === 'empty') {
    // First boot against this database: the seed is the real state. Write it
    // straight away so the next boot finds a snapshot.
    persistState.health = 'ready';
    await persistNow();
    return;
  }
  const state = loaded.state;
  try {
    replaceArray(tables.consultations, state.consultations);
    replaceArray(tables.sheets, state.sheets);
    replaceArray(tables.docMarks, state.docMarks);
    replaceArray(tables.publications, state.publications);
    replaceArray(tables.moderations, state.moderations);
    replaceArray(tables.topics, state.topics);
    replaceArray(tables.preferences, state.preferences);
    replaceArray(tables.slots, state.slots);
    replaceArray(tables.meetingRequests, state.meetingRequests);
    replaceArray(tables.signatures, state.signatures);
    replaceArray(tables.deliverables, state.deliverables);
    replaceArray(RUBRIC_VERSIONS, state.rubricVersions);
    replaceArray(tables.enrolments, state.enrolments);
    replaceArray(tables.deadlines, state.deadlines);
    replaceArray(tables.extensions, state.extensions);
    replaceArray(tables.meetingNotices, state.meetingNotices);
    if (state.contactEmails && typeof state.contactEmails === 'object') {
      for (const k of Object.keys(tables.contactEmails)) delete tables.contactEmails[k];
      Object.assign(tables.contactEmails, state.contactEmails as Record<string, string>);
    }
    // Reset codes are deliberately absent: an outstanding code must not
    // survive a restart it was never meant to outlive.
    replaceArray(STUDENTS, state.students);
    replaceArray(REGISTERED_STAFF, state.registeredStaff);
    replaceArray(PROJECTS, state.projects);
    if (state.passwords && typeof state.passwords === "object") {
      for (const k of Object.keys(tables.passwords)) delete tables.passwords[k];
      Object.assign(tables.passwords, state.passwords);
    }
    persistState.health = 'ready';
  } catch (error) {
    // An unreadable snapshot is not an empty one. Carrying on with seed data
    // would overwrite it on the next save, so writes stay blocked until a
    // person has looked.
    persistState.health = 'unreachable';
    persistState.lastError = `snapshot unreadable: ${error instanceof Error ? error.message : String(error)}`;
    console.error('[persist:unreadable]', persistState.lastError);
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

async function writeSnapshot(): Promise<SaveOutcome> {
  if (!persistenceEnabled()) return 'disabled';
  // Never write before the real state is loaded: see PersistenceHealth.
  if (persistState.health !== 'ready') return 'failed';
  const outcome = await savePersistedState(collectState());
  if (outcome === 'saved') {
    persistState.lastSavedAt = new Date().toISOString();
    persistState.lastError = null;
  } else if (outcome === 'failed') {
    persistState.lastError = 'last write to the database failed';
    // Keep trying in the background so a short database outage loses nothing
    // that was entered during it.
    retryTimer ??= setTimeout(() => { retryTimer = null; void persistNow(); }, 5000);
  }
  return outcome;
}

/**
 * Write the working state to the database now, and resolve only once the
 * write that includes the caller's change has finished.
 *
 * Writes are grouped: while one is in flight, every later caller shares a
 * single follow-up write, which will contain all of their changes. Forty
 * assessors tabbing through a sheet produce a handful of writes, not forty,
 * and none of them is acknowledged before its data is in Postgres.
 */
const committed = groupCommit(writeSnapshot);

export function persistNow(): Promise<SaveOutcome> {
  if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
  return committed();
}
/**
 * For changes that are not acknowledged to anyone as saved: coalesce into one
 * write a moment later. Marks do not go this way — they use persistNow().
 */
export function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistNow();
  }, 1500);
}
