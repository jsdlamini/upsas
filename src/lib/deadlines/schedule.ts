/**
 * Deadlines, extensions and accommodations.
 *
 * Until now every date in this programme lived in a Word document, which means
 * lateness was decided by whoever read the document last. A deadline that the
 * system holds can be shown to the student, applied consistently, and extended
 * on the record rather than by email.
 *
 * Two rules shape everything here:
 *
 *   An extension only ever moves a deadline later. A system that can quietly
 *   bring one forward is a system nobody can plan against.
 *
 *   The reason for an accommodation is not the supervisor's business. A
 *   supervisor sees that a student's date differs; only the coordinator who
 *   approved it sees why. Disability and medical grounds are exactly the data
 *   the Act treats most carefully, and the interface is where that is honoured
 *   or lost.
 */

export interface Deadline {
  id: string;
  cycleId: string;
  /** Stable key, referenced by extensions and by any submission record. */
  key: string;
  label: string;
  /** ISO instant. Time of day matters: 'Friday' is not a deadline. */
  dueAt: string;
  /** Minutes after dueAt still counted as on time. Absorbs clock skew and
   *  the student who submits at 23:59:40 on a slow connection. */
  graceMinutes: number;
  /** Shown to students, or held back while the schedule is being drafted. */
  published: boolean;
  note: string;
}

export type ExtensionKind = 'EXTENSION' | 'ACCOMMODATION';

export interface Extension {
  id: string;
  studentId: string;
  deadlineKey: string;
  /** The date that replaces the standard one for this student. */
  newDueAt: string;
  kind: ExtensionKind;
  /** Only ever shown to whoever holds config.edit. Never to a supervisor. */
  reason: string;
  approvedBy: string;
  approvedAt: string;
}

export type DeadlineState = 'DRAFT' | 'OPEN' | 'DUE_SOON' | 'GRACE' | 'MISSED' | 'SUBMITTED' | 'LATE';

export interface DeadlineStatus {
  state: DeadlineState;
  effectiveDueAt: string;
  /** Set when an extension applies, so the interface can say so. */
  extended: boolean;
  kind: ExtensionKind | null;
  minutesLate: number | null;
  hoursRemaining: number | null;
}

/** Inside this window the student is told the deadline is close. */
const DUE_SOON_HOURS = 72;

export function effectiveDueAt(deadline: Deadline, extension?: Extension | null): string {
  if (!extension) return deadline.dueAt;
  // An extension that would pull a deadline forward is ignored rather than
  // applied. Validation refuses to create one; this is the second line.
  return extension.newDueAt > deadline.dueAt ? extension.newDueAt : deadline.dueAt;
}

export function statusOf(
  deadline: Deadline,
  extension: Extension | null | undefined,
  submittedAt: string | null,
  now: Date,
): DeadlineStatus {
  const due = effectiveDueAt(deadline, extension);
  const dueMs = Date.parse(due);
  const graceMs = dueMs + deadline.graceMinutes * 60_000;
  const base = {
    effectiveDueAt: due,
    extended: Boolean(extension) && due !== deadline.dueAt,
    kind: extension?.kind ?? null,
  };

  if (!deadline.published) {
    return { ...base, state: 'DRAFT', minutesLate: null, hoursRemaining: null };
  }

  if (submittedAt) {
    const lateBy = Date.parse(submittedAt) - graceMs;
    return lateBy > 0
      ? { ...base, state: 'LATE', minutesLate: Math.ceil(lateBy / 60_000), hoursRemaining: null }
      : { ...base, state: 'SUBMITTED', minutesLate: null, hoursRemaining: null };
  }

  const nowMs = now.getTime();
  if (nowMs > graceMs) {
    return { ...base, state: 'MISSED', minutesLate: Math.ceil((nowMs - graceMs) / 60_000), hoursRemaining: null };
  }
  if (nowMs > dueMs) {
    return { ...base, state: 'GRACE', minutesLate: null, hoursRemaining: (graceMs - nowMs) / 3_600_000 };
  }
  const hoursRemaining = (dueMs - nowMs) / 3_600_000;
  return {
    ...base,
    state: hoursRemaining <= DUE_SOON_HOURS ? 'DUE_SOON' : 'OPEN',
    minutesLate: null,
    hoursRemaining,
  };
}

export function validateDeadline(draft: Omit<Deadline, 'id'>): string[] {
  const errors: string[] = [];
  if (!draft.label.trim()) errors.push('The deadline needs a name students will recognise.');
  if (!draft.key.trim() || !/^[a-z0-9-]+$/.test(draft.key)) {
    errors.push('The reference must be lowercase letters, numbers and hyphens.');
  }
  if (Number.isNaN(Date.parse(draft.dueAt))) errors.push('Give a date and a time. "Friday" is not a deadline.');
  if (!Number.isInteger(draft.graceMinutes) || draft.graceMinutes < 0 || draft.graceMinutes > 1440) {
    errors.push('Grace must be a whole number of minutes, up to 24 hours.');
  }
  return errors;
}

export function validateExtension(
  draft: Omit<Extension, 'id' | 'approvedAt'>, deadline: Deadline | null,
): string[] {
  const errors: string[] = [];
  if (!deadline) { errors.push('That deadline does not exist.'); return errors; }
  if (Number.isNaN(Date.parse(draft.newDueAt))) errors.push('Give the new date and time.');
  else if (draft.newDueAt <= deadline.dueAt) {
    errors.push('An extension moves a deadline later. To bring one forward, change the deadline for everyone.');
  }
  if (draft.reason.trim().length < 10) {
    errors.push('Record the grounds. They stay with the coordinator and are not shown to the supervisor.');
  }
  return errors;
}

/**
 * What a given viewer may see about an extension.
 *
 * A supervisor needs the date to supervise against. They do not need to know
 * that it moved because of a bereavement or a disability assessment.
 */
export function visibleReason(extension: Extension, viewerHoldsConfigEdit: boolean): string | null {
  return viewerHoldsConfigEdit ? extension.reason : null;
}

export function shortState(status: DeadlineStatus): string {
  switch (status.state) {
    case 'DRAFT': return 'not published';
    case 'OPEN': return 'open';
    case 'DUE_SOON': return `due in ${Math.max(1, Math.round(status.hoursRemaining ?? 0))} hours`;
    case 'GRACE': return 'in grace';
    case 'MISSED': return 'missed';
    case 'SUBMITTED': return 'submitted on time';
    case 'LATE': return `submitted ${Math.round((status.minutesLate ?? 0) / 60)} hours late`;
  }
}
