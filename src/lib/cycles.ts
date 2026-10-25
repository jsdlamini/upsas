import { prisma } from './prisma';
import type { AuthenticatedPrincipal } from './auth/login';

/**
 * Academic cycle management.
 *
 * The database row has a generated UUID `id`, but the rest of the codebase has
 * always used the cycle **label** (e.g. "2025/2026") as the `cycleId` string in
 * role grants, assessment periods and computed marks. `currentCycleId` below
 * therefore returns the current cycle's label, not its row id, so every
 * existing `cycleId` call site keeps working unchanged.
 *
 * Labels are immutable once created (they are the per-institution unique key);
 * dates and the `isCurrent` flag are editable.
 */

// Keep in step with `CYCLE` in src/lib/data/store.ts. Defined here rather
// than imported so this module never creates an import cycle with the store.
const FALLBACK_CYCLE = '2025/2026';

/* No-database mode backs cycles in memory, in step with the in-memory working
   store in src/lib/data/store.ts. Rows survive hot reload via globalThis. */
interface MemoryCycle extends CycleRow { tenantId: string; institutionId: string }
const globalForCycles = globalThis as unknown as { __upsasCycles?: MemoryCycle[] };
const memoryCycles: MemoryCycle[] = (globalForCycles.__upsasCycles ??= []);

export interface CycleRow {
  id: string;
  label: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
}

export interface CycleDates {
  startsOn: Date;
  endsOn: Date;
}

const CYCLE_RE = /^\s*(\d{4})\s*\/\s*(\d{4})\s*$/;

/** 1 Aug of the first year → 31 Jul of the second year, for a "YYYY/YYYY" label. */
export function deriveCycleDates(label: string): CycleDates {
  const m = CYCLE_RE.exec(label.trim());
  if (m) {
    const first = Number(m[1]);
    const second = Number(m[2]);
    if (Number.isInteger(first) && Number.isInteger(second) && second === first + 1) {
      return {
        startsOn: new Date(Date.UTC(first, 7, 1)),
        endsOn: new Date(Date.UTC(second, 6, 31)),
      };
    }
  }
  // Sensible defaults when the label does not carry the years.
  const now = new Date();
  const year = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return {
    startsOn: new Date(Date.UTC(year, 7, 1)),
    endsOn: new Date(Date.UTC(year + 1, 6, 31)),
  };
}

function dbReady(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** The current cycle's label, which is the value the app uses as `cycleId`. */
export async function currentCycleId(tenantId: string): Promise<string> {
  if (!dbReady()) {
    return memoryCycles.find((c) => c.tenantId === tenantId && c.isCurrent)?.label ?? FALLBACK_CYCLE;
  }
  try {
    const row = await prisma.academicCycle.findFirst({
      where: { tenantId, isCurrent: true },
      select: { label: true },
      orderBy: { startsOn: 'desc' },
    });
    return row?.label ?? FALLBACK_CYCLE;
  } catch {
    return FALLBACK_CYCLE;
  }
}

/** Alias for display contexts where "label" is clearer than "id". */
export async function currentCycleLabel(tenantId: string): Promise<string> {
  return currentCycleId(tenantId);
}

export async function listCycles(tenantId: string): Promise<CycleRow[]> {
  if (!dbReady()) {
    return memoryCycles
      .filter((c) => c.tenantId === tenantId)
      .sort((a, b) => b.startsOn.localeCompare(a.startsOn))
      .map(({ tenantId: _t, institutionId: _i, ...row }) => row);
  }
  const rows = await prisma.academicCycle.findMany({
    where: { tenantId },
    orderBy: { startsOn: 'desc' },
  });
  return rows.map((r) => ({
    id: r.id, label: r.label,
    startsOn: r.startsOn.toISOString(), endsOn: r.endsOn.toISOString(),
    isCurrent: r.isCurrent,
  }));
}

function validate(label: string, dates: CycleDates): { ok: true } | { ok: false; error: string } {
  const value = label.trim();
  if (!value) return { ok: false, error: 'Give the cycle a label, e.g. 2025/2026.' };
  if (value.length > 40) return { ok: false, error: 'Keep the cycle label under 40 characters.' };
  if (!(dates.startsOn instanceof Date) || !(dates.endsOn instanceof Date) || Number.isNaN(dates.startsOn.getTime()) || Number.isNaN(dates.endsOn.getTime())) {
    return { ok: false, error: 'Give the cycle a start and end date.' };
  }
  if (dates.startsOn >= dates.endsOn) {
    return { ok: false, error: 'The cycle must start before it ends.' };
  }
  return { ok: true };
}

export async function createCycle(
  tenantId: string,
  institutionId: string,
  input: { label: string; startsOn: Date; endsOn: Date; isCurrent: boolean },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const check = validate(input.label, { startsOn: input.startsOn, endsOn: input.endsOn });
  if (!check.ok) return check;
  if (!dbReady()) {
    const label = input.label.trim();
    if (memoryCycles.some((c) => c.tenantId === tenantId && c.label === label)) {
      return { ok: false, error: 'A cycle with that label already exists.' };
    }
    if (input.isCurrent) {
      for (const c of memoryCycles) { if (c.tenantId === tenantId) c.isCurrent = false; }
    }
    const row: MemoryCycle = {
      id: `cyc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      tenantId, institutionId, label,
      startsOn: input.startsOn.toISOString(), endsOn: input.endsOn.toISOString(),
      isCurrent: input.isCurrent,
    };
    memoryCycles.push(row);
    return { ok: true, id: row.id };
  }

  const label = input.label.trim();
  const existing = await prisma.academicCycle.findFirst({
    where: { tenantId, institutionId, label },
  });
  if (existing) return { ok: false, error: 'A cycle with that label already exists.' };

  let created;
  if (input.isCurrent) {
    const [, createdRow] = await prisma.$transaction([
      prisma.academicCycle.updateMany({ where: { tenantId, isCurrent: true }, data: { isCurrent: false } }),
      prisma.academicCycle.create({
        data: {
          tenantId, institutionId, label,
          startsOn: input.startsOn, endsOn: input.endsOn, isCurrent: true,
        },
      }),
    ]);
    created = createdRow;
  } else {
    created = await prisma.academicCycle.create({
      data: {
        tenantId, institutionId, label,
        startsOn: input.startsOn, endsOn: input.endsOn, isCurrent: false,
      },
    });
  }
  return { ok: true, id: created.id };
}

export async function updateCycle(
  tenantId: string,
  id: string,
  input: { startsOn: Date; endsOn: Date },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.startsOn >= input.endsOn) {
    return { ok: false, error: 'The cycle must start before it ends.' };
  }
  if (!dbReady()) {
    const row = memoryCycles.find((c) => c.id === id && c.tenantId === tenantId);
    if (!row) return { ok: false, error: 'No such cycle.' };
    row.startsOn = input.startsOn.toISOString();
    row.endsOn = input.endsOn.toISOString();
    return { ok: true };
  }
  const row = await prisma.academicCycle.findFirst({ where: { id, tenantId } });
  if (!row) return { ok: false, error: 'No such cycle.' };
  await prisma.academicCycle.update({
    where: { id },
    data: { startsOn: input.startsOn, endsOn: input.endsOn },
  });
  return { ok: true };
}

export async function setCurrentCycle(
  tenantId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!dbReady()) {
    const row = memoryCycles.find((c) => c.id === id && c.tenantId === tenantId);
    if (!row) return { ok: false, error: 'No such cycle.' };
    for (const c of memoryCycles) { if (c.tenantId === tenantId) c.isCurrent = c.id === id; }
    return { ok: true };
  }
  const row = await prisma.academicCycle.findFirst({ where: { id, tenantId } });
  if (!row) return { ok: false, error: 'No such cycle.' };
  await prisma.$transaction([
    prisma.academicCycle.updateMany({ where: { tenantId, isCurrent: true }, data: { isCurrent: false } }),
    prisma.academicCycle.update({ where: { id }, data: { isCurrent: true } }),
  ]);
  return { ok: true };
}

/**
 * Deletes a cycle, but only when it is safe to do so.
 *
 * Safest behaviour: refuse when the cycle is the current cycle, and refuse when
 * anything still points at it. The cycle label is stored as a plain `cycleId`
 * string on role grants and assessment periods (no foreign key), while
 * presentation sessions, assessment configs and their mark snapshots reference
 * the cycle row itself — all four are checked before deletion so nothing is
 * silently orphaned.
 */
export async function deleteCycle(
  tenantId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!dbReady()) {
    const row = memoryCycles.find((c) => c.id === id && c.tenantId === tenantId);
    if (!row) return { ok: false, error: 'No such cycle.' };
    if (row.isCurrent) {
      return { ok: false, error: 'This is the current cycle. Make another cycle current before deleting it.' };
    }
    // Lazy import: the store sits above this module in the graph.
    const { allPeople } = await import('./data/store');
    const grants = allPeople().filter((p) => p.grants.some((g) => g.cycleId === row.label && g.revokedAt === null)).length;
    const periods = (globalThis as unknown as { __upsasData?: { deadlines?: Array<{ cycleId: string }> } }).__upsasData
      ?.deadlines?.filter((d) => d.cycleId === row.label).length ?? 0;
    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
    const dependents: string[] = [];
    if (grants > 0) dependents.push(plural(grants, 'role assignment'));
    if (periods > 0) dependents.push(plural(periods, 'assessment period / deadline'));
    if (dependents.length > 0) {
      return {
        ok: false,
        error: `Cannot delete this cycle: it is still referenced by ${dependents.join(', ')}. Move or remove that data first.`,
      };
    }
    memoryCycles.splice(memoryCycles.indexOf(row), 1);
    return { ok: true };
  }
  const row = await prisma.academicCycle.findFirst({ where: { id, tenantId } });
  if (!row) return { ok: false, error: 'No such cycle.' };

  if (row.isCurrent) {
    return {
      ok: false,
      error: 'This is the current cycle. Make another cycle current before deleting it.',
    };
  }

  const [roleGrants, deadlines, sessions, configs, marks] = await Promise.all([
    prisma.roleAssignment.count({ where: { cycleId: row.label, user: { tenantId } } }),
    prisma.assessmentPeriod.count({ where: { tenantId, cycleId: row.label } }),
    prisma.presentationSession.count({ where: { tenantId, cycleId: id } }),
    prisma.assessmentConfig.count({ where: { tenantId, cycleId: id } }),
    prisma.markSnapshot.count({ where: { config: { cycleId: id, tenantId } } }),
  ]);

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const dependents: string[] = [];
  if (roleGrants > 0) dependents.push(plural(roleGrants, 'role assignment'));
  if (deadlines > 0) dependents.push(plural(deadlines, 'assessment period / deadline'));
  if (sessions > 0) dependents.push(plural(sessions, 'presentation session'));
  if (configs > 0) dependents.push(plural(configs, 'assessment configuration'));
  if (marks > 0) dependents.push(plural(marks, 'mark record'));

  if (dependents.length > 0) {
    return {
      ok: false,
      error: `Cannot delete this cycle: it is still referenced by ${dependents.join(', ')}. Move or remove that data first.`,
    };
  }

  try {
    await prisma.academicCycle.delete({ where: { id } });
  } catch {
    return {
      ok: false,
      error: 'Cannot delete this cycle: it is still referenced by other data.',
    };
  }
  return { ok: true };
}

export function canManageCycles(principal: AuthenticatedPrincipal | null): boolean {
  return Boolean(principal && (principal.roles.includes('ADMINISTRATOR') || principal.roles.includes('COORDINATOR')));
}
