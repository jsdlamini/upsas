import type { MarkSnapshot } from '../assessment/types';
import { toCsv, type Column } from './csv';

export interface ScheduleRow {
  readonly studentNumber: string;
  readonly surname: string;
  readonly otherNames: string;
  readonly programme: string;
  readonly courseCode: string;
  readonly supervisor: string;
  readonly projectTitle: string;
  readonly groupSize: number;
  readonly snapshot: MarkSnapshot;
  readonly published: boolean;
}

const pick = (s: MarkSnapshot, key: string): number | null =>
  s.components.find((c) => c.key === key)?.percentage ?? null;

/**
 * The departmental submission sheet. Every value comes from the snapshot — no
 * figure on this sheet is computed here, so the schedule and the published mark
 * cannot drift apart.
 */
export const SCHEDULE_COLUMNS: readonly Column<ScheduleRow>[] = [
  { header: 'Student ID', value: (r) => r.studentNumber, asText: true },
  { header: 'Surname', value: (r) => r.surname },
  { header: 'Names', value: (r) => r.otherNames },
  { header: 'Programme', value: (r) => r.programme },
  { header: 'Course', value: (r) => r.courseCode },
  { header: 'Supervisor', value: (r) => r.supervisor },
  { header: 'Project title', value: (r) => r.projectTitle },
  { header: 'Group size', value: (r) => r.groupSize },
  { header: 'Consultation %', value: (r) => fmt(pick(r.snapshot, 'consultation')) },
  { header: 'Presentation 1 %', value: (r) => fmt(pick(r.snapshot, 'p1')) },
  { header: 'Presentation 2 %', value: (r) => fmt(pick(r.snapshot, 'p2')) },
  { header: 'CA %', value: (r) => fmt(r.snapshot.caScore) },
  { header: 'Documentation %', value: (r) => fmt(r.snapshot.documentationScore) },
  { header: 'Final %', value: (r) => fmt(r.snapshot.finalMark) },
  { header: 'Grade', value: (r) => r.snapshot.grade ?? '' },
  { header: 'Status', value: (r) => (r.published ? 'Published' : r.snapshot.blocked ? 'Blocked' : 'Ready') },
  { header: 'Flags', value: (r) => r.snapshot.flags.map((f) => f.code).join('; ') },
  { header: 'Profile', value: (r) => r.snapshot.profileCode },
  { header: 'Snapshot computed', value: (r) => r.snapshot.computedAt },
];

function fmt(v: number | null): string {
  return v === null ? '' : v.toFixed(1);
}

/** Sorted by student number so the output is stable across runs. */
export function buildMarkSchedule(rows: readonly ScheduleRow[]): string {
  const ordered = [...rows].sort((a, b) => a.studentNumber.localeCompare(b.studentNumber));
  return toCsv(ordered, SCHEDULE_COLUMNS);
}
