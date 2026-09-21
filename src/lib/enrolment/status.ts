/**
 * Students who are not on the ordinary path.
 *
 * The rest of the system assumes a student starts in September, sits both
 * presentations and submits documentation. Real cohorts do not look like that.
 * Someone defers on medical grounds in March, someone withdraws in week four,
 * someone returns to repeat CSC 499 carrying a presentation they already
 * passed, someone sits a supplementary presentation after a referral.
 *
 * Each of those needs an answer to two questions, and getting either wrong
 * produces a wrong mark rather than an error:
 *
 *   Is this student assessed at all this cycle?
 *   Which components are they expected to sit, and which are already credited?
 *
 * Nothing here deletes anybody. A withdrawn student keeps every record they
 * generated; they simply stop being scheduled, marked and published.
 */

export type EnrolmentStatus =
  | 'ACTIVE'
  | 'DEFERRED'
  | 'WITHDRAWN'
  | 'SUPPLEMENTARY'
  | 'CARRY_OVER';

/** A component passed in an earlier cycle and credited to this one. */
export interface CarriedComponent {
  /** Matches a component key in the assessment config, e.g. 'P1'. */
  componentKey: string;
  /** The percentage awarded then. Carried as a percentage, never a raw total:
   *  the earlier cycle's rubric maximum may differ from this one's. */
  percentage: number;
  fromCycleId: string;
  /** Where the credit was decided — a board minute, a senate reference. */
  ref: string;
}

export interface Enrolment {
  studentId: string;
  status: EnrolmentStatus;
  /** When the status took effect, which is not when it was recorded. */
  effectiveFrom: string;
  /** Required for anything other than ACTIVE. Kept with the record. */
  note: string;
  decidedBy: string | null;
  decidedAt: string | null;
  carried: CarriedComponent[];
}

export const STATUS_LABEL: Record<EnrolmentStatus, string> = {
  ACTIVE: 'Active',
  DEFERRED: 'Deferred',
  WITHDRAWN: 'Withdrawn',
  SUPPLEMENTARY: 'Supplementary',
  CARRY_OVER: 'Carrying credit',
};

export const STATUS_MEANING: Record<EnrolmentStatus, string> = {
  ACTIVE: 'Sits every component this cycle.',
  DEFERRED: 'Not assessed this cycle. Records are kept and resume when they return.',
  WITHDRAWN: 'Left the programme. Not scheduled, not marked, not published.',
  SUPPLEMENTARY: 'Re-sitting referred components only. Credited components are not re-marked.',
  CARRY_OVER: 'Repeating the project, carrying credit for components already passed.',
};

/** Is this student marked at all this cycle? */
export function isAssessable(status: EnrolmentStatus): boolean {
  return status !== 'DEFERRED' && status !== 'WITHDRAWN';
}

/** Does this student appear on session lists, dashboards and cohort reports? */
export function appearsInCohort(status: EnrolmentStatus): boolean {
  return isAssessable(status);
}

/** Only these statuses may carry credit forward. */
export function mayCarryCredit(status: EnrolmentStatus): boolean {
  return status === 'SUPPLEMENTARY' || status === 'CARRY_OVER';
}

/** Is `componentKey` already credited, so nobody should be marking it? */
export function isCarried(enrolment: Enrolment, componentKey: string): boolean {
  return enrolment.carried.some((c) => c.componentKey === componentKey);
}

export function carriedFor(enrolment: Enrolment, componentKey: string): CarriedComponent | null {
  return enrolment.carried.find((c) => c.componentKey === componentKey) ?? null;
}

export function defaultEnrolment(studentId: string, cycleStart: string): Enrolment {
  return {
    studentId, status: 'ACTIVE', effectiveFrom: cycleStart, note: '',
    decidedBy: null, decidedAt: null, carried: [],
  };
}

export interface ChangeContext {
  /** True once a final mark has been released for this student this cycle. */
  published: boolean;
  /** True if any assessor has signed a sheet for them this cycle. */
  hasSignedMarks: boolean;
}

/**
 * What a coordinator may change a student to, and what they must say first.
 * Every rule here exists because the alternative is a mark that quietly stops
 * making sense rather than a change that is refused.
 */
export function validateChange(
  from: Enrolment, to: Omit<Enrolment, 'studentId' | 'decidedBy' | 'decidedAt'>,
  ctx: ChangeContext,
): string[] {
  const errors: string[] = [];

  if (to.status !== 'ACTIVE' && to.note.trim().length < 10) {
    errors.push('Say why. A status other than active is a decision about a person and is recorded as one.');
  }
  if (!to.effectiveFrom) {
    errors.push('Give the date the status took effect. It is rarely the date you are recording it.');
  }

  // A released result is corrected by supersession, which is a different
  // permission and a different paper trail. It is not undone with a dropdown.
  if (ctx.published && to.status !== from.status) {
    errors.push('This student has a released result. Correct it by supersession rather than by changing their status.');
  }

  if (to.status === 'WITHDRAWN' && ctx.hasSignedMarks && !to.note.toLowerCase().includes('mark')) {
    errors.push('Signed marks exist for this student. Say in the note what happens to them.');
  }

  if (!mayCarryCredit(to.status) && to.carried.length > 0) {
    errors.push(`${STATUS_LABEL[to.status]} students cannot carry credit. Use supplementary or carrying credit.`);
  }

  const seen = new Set<string>();
  for (const c of to.carried) {
    if (seen.has(c.componentKey)) errors.push(`${c.componentKey} is carried twice.`);
    seen.add(c.componentKey);
    if (!(c.percentage >= 0 && c.percentage <= 100)) {
      errors.push(`Carried credit for ${c.componentKey} must be a percentage between 0 and 100.`);
    }
    if (!c.fromCycleId.trim()) errors.push(`Say which cycle ${c.componentKey} was passed in.`);
    if (!c.ref.trim()) errors.push(`Give the board decision that credited ${c.componentKey}.`);
  }

  return errors;
}

/** One line for the cohort list and the mark breakdown. */
export function describe(enrolment: Enrolment): string {
  if (enrolment.status === 'ACTIVE') return STATUS_LABEL.ACTIVE;
  const carried = enrolment.carried.length
    ? `, carrying ${enrolment.carried.map((c) => `${c.componentKey} at ${c.percentage}%`).join(' and ')}`
    : '';
  return `${STATUS_LABEL[enrolment.status]} from ${enrolment.effectiveFrom.slice(0, 10)}${carried}`;
}
