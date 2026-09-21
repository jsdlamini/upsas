/**
 * Editing an assessment instrument.
 *
 * The columns of a marking sheet are not presentation. They are the instrument
 * the department assesses with, and a mark only means anything alongside the
 * instrument it was awarded under. So this module never mutates a rubric that
 * has been used; it decides between two outcomes and describes the consequences
 * before anything is written:
 *
 *   in place  — nothing has been marked under this version yet, so it is still
 *               a draft instrument and can be changed freely.
 *   fork      — marks exist. A new version is created. Sheets that are open
 *               move to it; sheets that are signed stay on the version they
 *               were signed under, for ever.
 *
 * Three invariants hold throughout, and each one exists because breaking it
 * would silently corrupt a student's mark rather than fail loudly:
 *
 *   1. A criterion id is permanent. Renaming "Implementation" to "Artefact and
 *      demonstration" keeps id `c5`, so every mark already keyed to `c5`
 *      survives the rename. Ids are never reused after removal.
 *   2. The rubric maximum is the sum of its criteria. It is computed here and
 *      nowhere typed, which is what keeps `normalisePercentage()` honest.
 *   3. Lowering a criterion's maximum below a mark already awarded clears that
 *      mark rather than truncating it. A truncated mark is an assessor's
 *      judgement silently overwritten; a cleared one is a blank the assessor
 *      is asked to fill in again.
 */

export interface Criterion {
  id: string;
  label: string;
  max: number;
}

export interface Instrument {
  versionId: string;
  component: 'p1' | 'p2';
  version: number;
  title: string;
  /** Always the sum of the criteria maxima. Persisted, never recomputed late. */
  max: number;
  criteria: Criterion[];
  /** True once any mark has been awarded under it. A locked version forks. */
  locked: boolean;
  createdAt: string;
  createdBy: string | null;
  /** Why this version exists. Required, and shown in the version history. */
  note: string | null;
  supersededBy: string | null;
}

/** One row of the coordinator's editing form. A null id means a new column. */
export interface DraftCriterion {
  id: string | null;
  label: string;
  max: number;
  remove?: boolean;
}

export interface Draft {
  title: string;
  criteria: DraftCriterion[];
  note: string;
}

/** The subset of a sheet this module needs. Keeps it free of the store. */
export interface SheetLike {
  assessorId: string;
  studentId: string;
  rubricVersionId: string;
  submitted: boolean;
  marks: Record<string, number | null>;
}

export interface ClearedMark {
  studentId: string;
  assessorId: string;
  criterionId: string;
  label: string;
  was: number;
  newMax: number;
}

export interface ChangePlan {
  mode: 'in-place' | 'fork';
  next: Instrument;
  added: string[];
  removed: string[];
  renamed: Array<{ from: string; to: string }>;
  rescaled: Array<{ label: string; from: number; to: number }>;
  maxBefore: number;
  maxAfter: number;
  /** Open sheets that will be moved onto the new version. */
  sheetsMigrated: number;
  /** Marks that no longer fit their criterion and will be blanked. */
  marksCleared: ClearedMark[];
  /** Sheets already signed. They stay on the old version. */
  sheetsFrozen: number;
  /**
   * Students whose panel would end up spanning two instruments, because one
   * assessor signed under the old version and another will mark under the new
   * one. Mathematically fine — every score normalises against its own maximum —
   * but it is an academic judgement, so it is never made silently.
   */
  splitPanels: string[];
  requiresAcknowledgement: boolean;
}

export type PlanResult =
  | { ok: true; plan: ChangePlan }
  | { ok: false; errors: string[] };

const MAX_LABEL = 80;
const MAX_CRITERION = 100;
const MIN_CRITERIA = 2;

/** `c1`, `c2`, … never reused, so a retired column cannot collide with a new one. */
export function nextCriterionId(usedIds: Iterable<string>): string {
  let highest = 0;
  for (const id of usedIds) {
    const m = /^c(\d+)$/.exec(id);
    if (m) highest = Math.max(highest, Number(m[1]));
  }
  return `c${highest + 1}`;
}

export function validateDraft(draft: Draft): string[] {
  const errors: string[] = [];
  const kept = draft.criteria.filter((c) => !c.remove);

  if (!draft.title.trim()) errors.push('The sheet needs a title.');
  if (draft.title.trim().length > 120) errors.push('The title is too long for a sheet header.');

  // Same standard as a moderation rationale: a sentence, recorded by name.
  if (draft.note.trim().length < 10) {
    errors.push('Say why this change is being made. It is recorded against your name in the version history.');
  }

  if (kept.length < MIN_CRITERIA) {
    errors.push(`A sheet needs at least ${MIN_CRITERIA} columns.`);
  }

  const seen = new Set<string>();
  for (const c of kept) {
    const label = c.label.trim();
    if (!label) { errors.push('Every column needs a heading.'); continue; }
    if (label.length > MAX_LABEL) errors.push(`"${label.slice(0, 24)}…" is too long for a column heading.`);
    const key = label.toLowerCase();
    if (seen.has(key)) errors.push(`Two columns are both called "${label}". Headings must be distinct.`);
    seen.add(key);
    if (!Number.isInteger(c.max) || c.max < 1 || c.max > MAX_CRITERION) {
      errors.push(`"${label}" must be worth a whole number of marks between 1 and ${MAX_CRITERION}.`);
    }
  }

  return errors;
}

/**
 * Work out what the change would do, without doing any of it.
 *
 * `sheets` is every sheet for this component, at any version. `usedIds` is
 * every criterion id this component has ever had, so retired ids stay retired.
 */
export function planChange(
  current: Instrument,
  draft: Draft,
  sheets: readonly SheetLike[],
  now: string,
  byUserId: string,
  usedIds: Iterable<string> = [],
): PlanResult {
  const errors = validateDraft(draft);
  if (errors.length) return { ok: false, errors };

  const onCurrent = sheets.filter((s) => s.rubricVersionId === current.versionId);
  const hasMarks = sheets.some((s) => Object.values(s.marks).some((v) => v !== null));
  const mode: ChangePlan['mode'] = hasMarks ? 'fork' : 'in-place';

  // Build the new criteria list, preserving ids for everything that survives.
  const allIds = new Set<string>([...usedIds, ...current.criteria.map((c) => c.id)]);
  const criteria: Criterion[] = [];
  const added: string[] = [];
  const renamed: Array<{ from: string; to: string }> = [];
  const rescaled: Array<{ label: string; from: number; to: number }> = [];

  for (const row of draft.criteria) {
    if (row.remove) continue;
    const label = row.label.trim();
    const existing = row.id ? current.criteria.find((c) => c.id === row.id) : undefined;
    if (existing) {
      if (existing.label !== label) renamed.push({ from: existing.label, to: label });
      if (existing.max !== row.max) rescaled.push({ label, from: existing.max, to: row.max });
      criteria.push({ id: existing.id, label, max: row.max });
    } else {
      const id = nextCriterionId(allIds);
      allIds.add(id);
      added.push(label);
      criteria.push({ id, label, max: row.max });
    }
  }

  const keptIds = new Set(criteria.map((c) => c.id));
  const removed = current.criteria.filter((c) => !keptIds.has(c.id)).map((c) => c.label);
  const maxAfter = criteria.reduce((sum, c) => sum + c.max, 0);

  const next: Instrument = {
    versionId: mode === 'fork'
      ? `rv-${current.component}-${current.version + 1}`
      : current.versionId,
    component: current.component,
    version: mode === 'fork' ? current.version + 1 : current.version,
    title: draft.title.trim(),
    max: maxAfter,
    criteria,
    locked: false,
    createdAt: now,
    createdBy: byUserId,
    note: draft.note.trim(),
    supersededBy: null,
  };

  // What happens to marks already entered against the version being replaced.
  const marksCleared: ClearedMark[] = [];
  const open = onCurrent.filter((s) => !s.submitted);
  const frozen = onCurrent.filter((s) => s.submitted);

  for (const sheet of open) {
    for (const [criterionId, value] of Object.entries(sheet.marks)) {
      if (value === null) continue;
      const target = criteria.find((c) => c.id === criterionId);
      if (!target) {
        const old = current.criteria.find((c) => c.id === criterionId);
        marksCleared.push({
          studentId: sheet.studentId, assessorId: sheet.assessorId, criterionId,
          label: old?.label ?? criterionId, was: value, newMax: 0,
        });
      } else if (value > target.max) {
        marksCleared.push({
          studentId: sheet.studentId, assessorId: sheet.assessorId, criterionId,
          label: target.label, was: value, newMax: target.max,
        });
      }
    }
  }

  // A student is split if someone has already signed for them and someone else
  // has not, so the two sheets in their panel would sit on different versions.
  const splitPanels: string[] = [];
  if (mode === 'fork') {
    const frozenStudents = new Set(frozen.map((s) => s.studentId));
    const movingStudents = new Set(open.map((s) => s.studentId));
    for (const studentId of frozenStudents) {
      if (movingStudents.has(studentId)) splitPanels.push(studentId);
    }
  }

  return {
    ok: true,
    plan: {
      mode, next, added, removed, renamed, rescaled,
      maxBefore: current.max, maxAfter,
      sheetsMigrated: mode === 'fork' ? open.length : 0,
      marksCleared,
      sheetsFrozen: mode === 'fork' ? frozen.length : 0,
      splitPanels,
      requiresAcknowledgement:
        mode === 'fork' && (frozen.length > 0 || marksCleared.length > 0),
    },
  };
}

/**
 * Move an open sheet onto the new version: drop marks for removed columns,
 * blank marks that no longer fit, and restamp the version and maximum the
 * sheet records. Mutates the sheet, which is what the caller wants.
 */
export function migrateSheet(sheet: SheetLike & { rubricMax: number }, next: Instrument): void {
  const byId = new Map(next.criteria.map((c) => [c.id, c]));
  for (const [criterionId, value] of Object.entries(sheet.marks)) {
    const target = byId.get(criterionId);
    if (!target) { delete sheet.marks[criterionId]; continue; }
    if (value !== null && value > target.max) sheet.marks[criterionId] = null;
  }
  sheet.rubricVersionId = next.versionId;
  sheet.rubricMax = next.max;
}

/** A one-line summary of a plan, for the audit entry and the history list. */
export function describePlan(plan: ChangePlan): string {
  const parts: string[] = [];
  if (plan.added.length) parts.push(`added ${plan.added.join(', ')}`);
  if (plan.removed.length) parts.push(`removed ${plan.removed.join(', ')}`);
  if (plan.renamed.length) parts.push(`renamed ${plan.renamed.map((r) => `${r.from} → ${r.to}`).join(', ')}`);
  if (plan.rescaled.length) parts.push(`rescaled ${plan.rescaled.map((r) => `${r.label} ${r.from}→${r.to}`).join(', ')}`);
  if (plan.maxBefore !== plan.maxAfter) parts.push(`total ${plan.maxBefore} → ${plan.maxAfter}`);
  return parts.length ? parts.join('; ') : 'no structural change';
}
