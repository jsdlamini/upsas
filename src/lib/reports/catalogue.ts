/**
 * Report catalogue.
 *
 * Three rules hold for every report in this system:
 *
 *  1. Reports read a published MarkSnapshot. They never recompute. A report and
 *     the mark it reports on cannot disagree, because there is only one number.
 *  2. Every extraction is an audit event. Exports move personal data out of the
 *     system, which is exactly what the Eswatini Data Protection Act 41 of 2022
 *     expects a controller to be able to account for.
 *  3. Generation is deterministic. The same snapshot produces a byte-identical
 *     file, so a content hash is meaningful and a filed PDF can be proved to be
 *     the one that was issued.
 */

export type ReportFormat = 'CSV' | 'XLSX' | 'PDFA' | 'JSON';

export type ReportScope =
  /** The requesting student only. */
  | 'SELF'
  /** The requester's own supervisees. */
  | 'OWN_SUPERVISEES'
  /** A cohort the requester is assigned to. */
  | 'ASSIGNED_COHORT'
  /** Whole cycle — coordinator and administrator. */
  | 'CYCLE';

export interface ReportDefinition {
  readonly key: string;
  readonly title: string;
  /** What it is for, in the words the person running it would use. */
  readonly purpose: string;
  readonly formats: readonly ReportFormat[];
  readonly scope: ReportScope;
  readonly roles: readonly string[];
  /** True where the output is filed as evidence and must be PDF/A/hash-stamped. */
  readonly evidentiary: boolean;
  /** True where unpublished marks may appear, and must be watermarked. */
  readonly mayIncludeUnpublished: boolean;
  readonly containsPersonalData: boolean;
}

export const REPORTS: readonly ReportDefinition[] = [
  {
    key: 'mark-schedule',
    title: 'Cohort mark schedule',
    purpose: 'The departmental submission sheet: CA, documentation, final mark and grade for every student in the cycle.',
    formats: ['CSV', 'XLSX', 'PDFA'],
    scope: 'CYCLE',
    roles: ['COORDINATOR', 'ADMINISTRATOR'],
    evidentiary: true,
    mayIncludeUnpublished: true,
    containsPersonalData: true,
  },
  {
    key: 'student-mark-sheet',
    title: 'Student mark sheet',
    purpose: 'One student’s full breakdown with working, panel composition and provenance. The document that answers an appeal.',
    formats: ['PDFA'],
    scope: 'SELF',
    roles: ['STUDENT', 'SUPERVISOR', 'COORDINATOR', 'EXTERNAL_EXAMINER'],
    evidentiary: true,
    mayIncludeUnpublished: false,
    containsPersonalData: true,
  },
  {
    key: 'assessor-sheet',
    title: 'Assessor presentation form',
    purpose: 'One assessor’s submitted sheet reproduced in the departmental paper layout, for physical filing.',
    formats: ['PDFA'],
    scope: 'ASSIGNED_COHORT',
    roles: ['ASSESSOR', 'COORDINATOR'],
    evidentiary: true,
    mayIncludeUnpublished: false,
    containsPersonalData: true,
  },
  {
    key: 'consultation-register',
    title: 'Consultation register',
    purpose: 'Every session with both attestations. Replaces the signed paper register and is the artefact produced in a dispute.',
    formats: ['CSV', 'PDFA'],
    scope: 'OWN_SUPERVISEES',
    roles: ['SUPERVISOR', 'COORDINATOR', 'EXTERNAL_EXAMINER'],
    evidentiary: true,
    mayIncludeUnpublished: false,
    containsPersonalData: true,
  },
  {
    key: 'presentation-eligibility',
    title: 'Presentation nomination list',
    purpose: 'The list of students a supervisor has cleared to present, which the guidelines require them to submit to the coordinators.',
    formats: ['CSV', 'PDFA'],
    scope: 'OWN_SUPERVISEES',
    roles: ['SUPERVISOR', 'COORDINATOR'],
    evidentiary: false,
    mayIncludeUnpublished: false,
    containsPersonalData: true,
  },
  {
    key: 'moderation-report',
    title: 'Moderation report',
    purpose: 'Every discrepancy that exceeded the threshold, who resolved it, the agreed mark and the recorded rationale.',
    formats: ['CSV', 'PDFA'],
    scope: 'CYCLE',
    roles: ['COORDINATOR', 'EXTERNAL_EXAMINER'],
    evidentiary: true,
    mayIncludeUnpublished: true,
    containsPersonalData: true,
  },
  {
    key: 'mark-distribution',
    title: 'Mark distribution and outliers',
    purpose: 'Grade histogram, mean and spread by programme and by supervisor, with outlier detection for quality assurance.',
    formats: ['CSV', 'XLSX', 'PDFA'],
    scope: 'CYCLE',
    roles: ['COORDINATOR', 'EXTERNAL_EXAMINER'],
    evidentiary: false,
    mayIncludeUnpublished: true,
    containsPersonalData: false,
  },
  {
    key: 'readiness-to-publish',
    title: 'Readiness to publish',
    purpose: 'What is still blocking release: missing marks, pending moderation, unmet consultation gates, unfiled contribution statements.',
    formats: ['CSV', 'PDFA'],
    scope: 'CYCLE',
    roles: ['COORDINATOR'],
    evidentiary: false,
    mayIncludeUnpublished: true,
    containsPersonalData: true,
  },
  {
    key: 'supervision-load',
    title: 'Supervision load',
    purpose: 'Students per supervisor against capacity, counted across all their topics. Used to balance the allocation round.',
    formats: ['CSV', 'XLSX'],
    scope: 'CYCLE',
    roles: ['COORDINATOR', 'ADMINISTRATOR'],
    evidentiary: false,
    mayIncludeUnpublished: false,
    containsPersonalData: true,
  },
  {
    key: 'cohort-progress',
    title: 'Cohort progress',
    purpose: 'Where every project sits in the lifecycle, with stalled projects and overdue ethics highlighted.',
    formats: ['CSV', 'XLSX'],
    scope: 'CYCLE',
    roles: ['COORDINATOR'],
    evidentiary: false,
    mayIncludeUnpublished: false,
    containsPersonalData: true,
  },
  {
    key: 'external-examiner-pack',
    title: 'External examiner pack',
    purpose: 'A sample across grade bands with rubrics, scripts, moderation evidence and the mark schedule, as one bundle.',
    formats: ['PDFA', 'JSON'],
    scope: 'ASSIGNED_COHORT',
    roles: ['COORDINATOR', 'EXTERNAL_EXAMINER'],
    evidentiary: true,
    mayIncludeUnpublished: false,
    containsPersonalData: true,
  },
  {
    key: 'audit-extract',
    title: 'Audit extract',
    purpose: 'The full hash-chained history behind one mark, with the chain verification result attached.',
    formats: ['JSON', 'PDFA'],
    scope: 'CYCLE',
    roles: ['COORDINATOR', 'ADMINISTRATOR', 'EXTERNAL_EXAMINER'],
    evidentiary: true,
    mayIncludeUnpublished: true,
    containsPersonalData: true,
  },
  {
    key: 'subject-access',
    title: 'Subject access export',
    purpose: 'Everything held about one person, assembled for a data-subject request under the Data Protection Act 41 of 2022.',
    formats: ['JSON', 'PDFA'],
    scope: 'SELF',
    roles: ['STUDENT', 'ADMINISTRATOR'],
    evidentiary: false,
    mayIncludeUnpublished: true,
    containsPersonalData: true,
  },
  {
    key: 'retention-schedule',
    title: 'Retention and disposal schedule',
    purpose: 'What is held, under which lawful basis, and what falls due for disposal in this cycle.',
    formats: ['CSV', 'PDFA'],
    scope: 'CYCLE',
    roles: ['ADMINISTRATOR', 'COORDINATOR'],
    evidentiary: false,
    mayIncludeUnpublished: false,
    containsPersonalData: false,
  },
] as const;

export function reportsFor(roles: readonly string[]): readonly ReportDefinition[] {
  return REPORTS.filter((r) => r.roles.some((role) => roles.includes(role)));
}

export function requireDefinition(key: string): ReportDefinition {
  const d = REPORTS.find((r) => r.key === key);
  if (!d) throw new Error(`Unknown report: ${key}`);
  return d;
}
