import { prisma } from './prisma';
import { CYCLE } from './data/store';
import type { AuthenticatedPrincipal } from './auth/login';

/**
 * Academic cycle management.
 *
 * The cycle's `id` IS its label (e.g. "2025/2026"). The codebase has always
 * used the label as the `cycleId` string in role grants, assessment periods
 * and computed marks, so keeping id == label means none of those call sites
 * change their semantics. Labels are therefore immutable once created; dates
 * and the `isCurrent` flag are editable.
 */

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

export async function currentCycleId(tenantId: string): Promise<string> {
  if (!dbReady()) return CYCLE;
  try {
    const row = await prisma.academicCycle.findFirst({
      where: { tenantId, isCurrent: true },
      select: { id: true },
      orderBy: { startsOn: 'desc' },
    });
    return row?.id ?? CYCLE;
  } catch {
    return CYCLE;
  }
}

export async function currentCycleLabel(tenantId: string): Promise<string> {
  if (!dbReady()) return CYCLE;
  try {
    const row = await prisma.academicCycle.findFirst({
      where: { tenantId, isCurrent: true },
      select: { label: true },
      orderBy: { startsOn: 'desc' },
    });
    return row?.label ?? CYCLE;
  } catch {
    return CYCLE;
  }
}

export async function listCycles(tenantId: string): Promise<CycleRow[]> {
  if (!dbReady()) return [];
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
  if (!dbReady()) return { ok: false, error: 'No database.' };
  const check = validate(input.label, { startsOn: input.startsOn, endsOn: input.endsOn });
  if (!check.ok) return check;

  const id = input.label.trim();
  const existing = await prisma.academicCycle.findFirst({
    where: { institutionId, label: input.label.trim() },
  });
  if (existing) return { ok: false, error: 'A cycle with that label already exists.' };

  if (input.isCurrent) {
    await prisma.$transaction([
      prisma.academicCycle.updateMany({ where: { tenantId, isCurrent: true }, data: { isCurrent: false } }),
      prisma.academicCycle.create({
        data: {
          id, tenantId, institutionId, label: input.label.trim(),
          startsOn: input.startsOn, endsOn: input.endsOn, isCurrent: true,
        },
      }),
    ]);
  } else {
    await prisma.academicCycle.create({
      data: {
        id, tenantId, institutionId, label: input.label.trim(),
        startsOn: input.startsOn, endsOn: input.endsOn, isCurrent: false,
      },
    });
  }
  return { ok: true, id };
}

export async function updateCycle(
  tenantId: string,
  id: string,
  input: { startsOn: Date; endsOn: Date },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!dbReady()) return { ok: false, error: 'No database.' };
  if (!(input.startsOn instanceof Date) || !(input.endsOn instanceof Date) ||
      Number.isNaN(input.startsOn.getTime()) || Number.isNaN(input.endsOn.getTime())) {
    return { ok: false, error: 'Give the cycle a start and end date.' };
  }
  if (input.startsOn >= input.endsOn) {
    return { ok: false, error: 'The cycle must start before it ends.' };
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
  if (!dbReady()) return { ok: false, error: 'No database.' };
  const row = await prisma.academicCycle.findFirst({ where: { id, tenantId } });
  if (!row) return { ok: false, error: 'No such cycle.' };
  await prisma.$transaction([
    prisma.academicCycle.updateMany({ where: { tenantId, isCurrent: true }, data: { isCurrent: false } }),
    prisma.academicCycle.update({ where: { id }, data: { isCurrent: true } }),
  ]);
  return { ok: true };
}

export function canManageCycles(principal: AuthenticatedPrincipal | null): boolean {
  return Boolean(principal && (principal.roles.includes('ADMINISTRATOR') || principal.roles.includes('COORDINATOR')));
}
