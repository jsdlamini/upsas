import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/prisma';
import {
  currentCycleId, currentCycleLabel, listCycles, createCycle, updateCycle,
  setCurrentCycle, canManageCycles, deriveCycleDates,
} from '../src/lib/cycles';
import type { AuthenticatedPrincipal } from '../src/lib/auth/login';

const TENANT = 'cycletest';
const INST = 'cycletest-inst';

async function clean(): Promise<void> {
  await prisma.academicCycle.deleteMany({ where: { tenantId: TENANT } });
  await prisma.institution.deleteMany({ where: { id: INST } });
}

async function ensureInstitution(): Promise<void> {
  await prisma.institution.upsert({
    where: { id: INST },
    create: { id: INST, tenantId: TENANT, name: 'Cycle Test' },
    update: {},
  });
}

function admin(roles: string[] = ['ADMINISTRATOR']): AuthenticatedPrincipal {
  return {
    userId: 'u-admin', roles: roles as AuthenticatedPrincipal['roles'],
    resolvedRoles: [], permissions: [], cycleId: '2025/2026',
    mfaSatisfied: true, tenantId: TENANT,
  };
}

test('deriveCycleDates parses a YYYY/YYYY label into academic-year dates', () => {
  const d = deriveCycleDates('2025/2026');
  assert.equal(d.startsOn.toISOString(), new Date(Date.UTC(2025, 7, 1)).toISOString());
  assert.equal(d.endsOn.toISOString(), new Date(Date.UTC(2026, 6, 31)).toISOString());
});

test('createCycle makes the cycle current and currentCycleId resolves it', async () => {
  await clean();
  await ensureInstitution();
  const r = await createCycle(TENANT, INST, {
    label: '2025/2026', startsOn: new Date('2025-08-01T00:00:00Z'),
    endsOn: new Date('2026-07-31T00:00:00Z'), isCurrent: true,
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.id, '2025/2026');

  const row = await prisma.academicCycle.findUnique({ where: { id: '2025/2026' } });
  assert.ok(row);
  assert.equal(row.label, '2025/2026');
  assert.equal(row.tenantId, TENANT);
  assert.equal(row.institutionId, INST);
  assert.equal(row.isCurrent, true);

  assert.equal(await currentCycleId(TENANT), '2025/2026');
  assert.equal(await currentCycleLabel(TENANT), '2025/2026');
  await clean();
});

test('createCycle rejects a duplicate label within one institution', async () => {
  await clean();
  await ensureInstitution();
  const dates = { startsOn: new Date('2025-08-01T00:00:00Z'), endsOn: new Date('2026-07-31T00:00:00Z') };
  assert.equal((await createCycle(TENANT, INST, { label: '2025/2026', ...dates, isCurrent: true })).ok, true);
  const dup = await createCycle(TENANT, INST, { label: '2025/2026', ...dates, isCurrent: false });
  assert.equal(dup.ok, false);
  await clean();
});

test('createCycle rejects startsOn on or after endsOn', async () => {
  await clean();
  await ensureInstitution();
  const bad = await createCycle(TENANT, INST, {
    label: '2026/2027', startsOn: new Date('2027-07-31T00:00:00Z'),
    endsOn: new Date('2027-07-31T00:00:00Z'), isCurrent: false,
  });
  assert.equal(bad.ok, false);
  await clean();
});

test('setCurrentCycle flips the current flag atomically', async () => {
  await clean();
  await ensureInstitution();
  const dates = { startsOn: new Date('2025-08-01T00:00:00Z'), endsOn: new Date('2026-07-31T00:00:00Z') };
  await createCycle(TENANT, INST, { label: '2025/2026', ...dates, isCurrent: true });
  await createCycle(TENANT, INST, { label: '2026/2027', ...dates, isCurrent: false });

  const r = await setCurrentCycle(TENANT, '2026/2027');
  assert.equal(r.ok, true);
  const rows = await listCycles(TENANT);
  assert.deepEqual(rows.filter((c) => c.isCurrent).map((c) => c.id), ['2026/2027']);
  await clean();
});

test('listCycles is tenant-scoped', async () => {
  await clean();
  await ensureInstitution();
  await prisma.academicCycle.create({
    data: {
      id: 'other-cycle', tenantId: 'other-tenant', institutionId: INST,
      label: 'other-cycle', startsOn: new Date('2025-08-01T00:00:00Z'),
      endsOn: new Date('2026-07-31T00:00:00Z'), isCurrent: true,
    },
  });
  const rows = await listCycles(TENANT);
  assert.ok(rows.every((c) => c.id !== 'other-cycle'));
  await prisma.academicCycle.deleteMany({ where: { id: 'other-cycle' } });
  await clean();
});

test('updateCycle changes dates but never the label', async () => {
  await clean();
  await ensureInstitution();
  await createCycle(TENANT, INST, {
    label: '2025/2026', startsOn: new Date('2025-08-01T00:00:00Z'),
    endsOn: new Date('2026-07-31T00:00:00Z'), isCurrent: true,
  });
  const r = await updateCycle(TENANT, '2025/2026', {
    startsOn: new Date('2025-09-01T00:00:00Z'), endsOn: new Date('2026-08-31T00:00:00Z'),
  });
  assert.equal(r.ok, true);
  const row = await prisma.academicCycle.findUnique({ where: { id: '2025/2026' } });
  assert.equal(row?.label, '2025/2026');
  assert.equal(row?.startsOn.toISOString(), new Date('2025-09-01T00:00:00Z').toISOString());
  await clean();
});

test('canManageCycles is true only for admins and coordinators', () => {
  assert.equal(canManageCycles(admin(['ADMINISTRATOR'])), true);
  assert.equal(canManageCycles(admin(['COORDINATOR'])), true);
  assert.equal(canManageCycles(admin(['SUPERVISOR'])), false);
  assert.equal(canManageCycles(admin([])), false);
});
