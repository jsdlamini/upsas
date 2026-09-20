import { toCsv, type Column } from './csv';

/**
 * The evidential record that replaces the signed paper register. Every session
 * appears, including no-shows, with both attestations and whether it counted
 * toward the minimum — a register that showed only the sessions that counted
 * would be no use in a dispute.
 */

export interface RegisterRow {
  readonly studentNumber: string;
  readonly studentName: string;
  readonly supervisor: string;
  readonly periodCode: string;
  readonly heldAt: string;
  readonly mode: string;
  readonly status: string;
  readonly agenda: string;
  readonly deliverableReviewed: string;
  readonly supervisorAttestedAt: string | null;
  readonly studentAttestedAt: string | null;
  readonly rawTotal: number | null;
  readonly rubricMax: number | null;
  readonly counted: boolean;
  readonly actionItems: number;
}

export const REGISTER_COLUMNS: readonly Column<RegisterRow>[] = [
  { header: 'Student ID', value: (r) => r.studentNumber, asText: true },
  { header: 'Student', value: (r) => r.studentName },
  { header: 'Supervisor', value: (r) => r.supervisor },
  { header: 'Period', value: (r) => r.periodCode },
  { header: 'Held at', value: (r) => r.heldAt },
  { header: 'Mode', value: (r) => r.mode },
  { header: 'Status', value: (r) => r.status },
  { header: 'Agenda', value: (r) => r.agenda },
  { header: 'Deliverable reviewed', value: (r) => r.deliverableReviewed },
  { header: 'Supervisor attested', value: (r) => r.supervisorAttestedAt ?? '' },
  { header: 'Student attested', value: (r) => r.studentAttestedAt ?? '' },
  { header: 'Raw mark', value: (r) => r.rawTotal },
  { header: 'Rubric max', value: (r) => r.rubricMax },
  { header: 'Normalised %', value: (r) =>
      r.rawTotal !== null && r.rubricMax ? ((r.rawTotal / r.rubricMax) * 100).toFixed(1) : '' },
  { header: 'Counted toward minimum', value: (r) => (r.counted ? 'Yes' : 'No') },
  { header: 'Action items', value: (r) => r.actionItems },
];

export function buildConsultationRegister(rows: readonly RegisterRow[]): string {
  const ordered = [...rows].sort(
    (a, b) => a.studentNumber.localeCompare(b.studentNumber) || a.heldAt.localeCompare(b.heldAt),
  );
  return toCsv(ordered, REGISTER_COLUMNS);
}

export interface RegisterSummary {
  readonly studentNumber: string;
  readonly held: number;
  readonly counted: number;
  readonly noShows: number;
  readonly required: number;
  readonly meetsMinimum: boolean;
}

export function summariseRegister(
  rows: readonly RegisterRow[],
  requiredPerPeriod: number,
  periods: readonly string[],
): readonly RegisterSummary[] {
  const byStudent = new Map<string, RegisterRow[]>();
  for (const r of rows) {
    const list = byStudent.get(r.studentNumber) ?? [];
    list.push(r);
    byStudent.set(r.studentNumber, list);
  }
  return [...byStudent.entries()]
    .map(([studentNumber, list]) => ({
      studentNumber,
      held: list.filter((r) => r.status === 'COMPLETED').length,
      counted: list.filter((r) => r.counted).length,
      noShows: list.filter((r) => r.status.startsWith('NO_SHOW')).length,
      required: requiredPerPeriod * periods.length,
      meetsMinimum: periods.every(
        (p) => list.filter((r) => r.counted && r.periodCode === p).length >= requiredPerPeriod,
      ),
    }))
    .sort((a, b) => a.studentNumber.localeCompare(b.studentNumber));
}
