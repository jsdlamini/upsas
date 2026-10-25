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

test('createCycle makes the cycle current and currentCycleId resolves its label', async () => {
  await clean();
  await ensureInstitution();
  const r = await createCycle(TENANT, INST, {
    label: '2025/2026', startsOn: new Date('2025-08-01T00:00:00Z'),
    endsOn: new Date('2026-07-31T00:00:00Z'), isCurrent: true,
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.ok(r.id, 'expected a generated row id');

  const row = await prisma.academicCycle.findFirst({ where: { tenantId: TENANT, label: '2025/2026' } });
  assert.ok(row);
  assert.equal(row.id, r.id);
  assert.equal(row.label, '2025/2026');
  assert.equal(row.tenantId, TENANT);
  assert.equal(row.institutionId, INST);
  assert.equal(row.isCurrent, true);

  assert.equal(await currentCycleId(TENANT), '2025/2026');
  assert.equal(await currentCycleLabel(TENANT), '2025/2026');
  await clean();
});

test('two institutions may use the same cycle label', async () => {
  await clean();
  await ensureInstitution();
  const otherInst = 'cycletest-other-inst';
  await prisma.institution.upsert({
    where: { id: otherInst },
    create: { id: otherInst, tenantId: 'cycletest-other', name: 'Other' },
    update: {},
  });
  const dates = { startsOn: new Date('2025-08-01T00:00:00Z'), endsOn: new Date('2026-07-31T00:00:00Z') };
  const a = await createCycle(TENANT, INST, { label: '2025/2026', ...dates, isCurrent: true });
  const b = await createCycle('cycletest-other', otherInst, { label: '2025/2026', ...dates, isCurrent: true });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  if (a.ok && b.ok) assert.notEqual(a.id, b.id);
  await prisma.academicCycle.deleteMany({ where: { tenantId: { in: [TENANT, 'cycletest-other'] } } });
  await prisma.institution.deleteMany({ where: { id: { in: [INST, otherInst] } } });
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
  const second = await createCycle(TENANT, INST, { label: '2026/2027', ...dates, isCurrent: false });
  assert.equal(second.ok, true);
  if (!second.ok) return;

  const r = await setCurrentCycle(TENANT, second.id);
  assert.equal(r.ok, true);
  const rows = await listCycles(TENANT);
  assert.deepEqual(rows.filter((c) => c.isCurrent).map((c) => c.label), ['2026/2027']);
  await clean();
});

test('listCycles is tenant-scoped', async () => {
  await clean();
  await ensureInstitution();
  await prisma.academicCycle.create({
    data: {
      tenantId: 'other-tenant', institutionId: INST,
      label: 'other-cycle', startsOn: new Date('2025-08-01T00:00:00Z'),
      endsOn: new Date('2026-07-31T00:00:00Z'), isCurrent: true,
    },
  });
  const rows = await listCycles(TENANT);
  assert.ok(rows.every((c) => c.label !== 'other-cycle'));
  await prisma.academicCycle.deleteMany({ where: { tenantId: 'other-tenant' } });
  await clean();
});

test('updateCycle changes dates but never the label', async () => {
  await clean();
  await ensureInstitution();
  const created = await createCycle(TENANT, INST, {
    label: '2025/2026', startsOn: new Date('2025-08-01T00:00:00Z'),
    endsOn: new Date('2026-07-31T00:00:00Z'), isCurrent: true,
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const r = await updateCycle(TENANT, created.id, {
    startsOn: new Date('2025-09-01T00:00:00Z'), endsOn: new Date('2026-08-31T00:00:00Z'),
  });
  assert.equal(r.ok, true);
  const row = await prisma.academicCycle.findUnique({ where: { id: created.id } });
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
