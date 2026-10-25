import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/prisma';
import { createTenant, listTenants, setTenantSuspension } from '../src/lib/tenant-provisioning';
import { DEFAULT_EMAIL_SETTINGS } from '../src/lib/email-config';
import { resetEmailForTests, setStoredEmailSettings } from '../src/lib/data/store';

test('createTenant provisions an isolated, fully-formed tenant', async () => {
  const r = await createTenant({
    name: 'Test Coast University',
    slug: 'testcoast',
    adminName: 'Ada',
    adminSurname: 'Lovelace',
    adminEmail: 'ada@testcoast.example',
    adminUsername: 'ada',
    adminPassword: 'password123',
    cycleLabel: '2025/2026',
  });
  assert.equal(r.ok, true);

  const tenant = await prisma.tenant.findUnique({ where: { id: 'testcoast' } });
  assert.ok(tenant);
  const inst = await prisma.institution.findUnique({ where: { id: 'testcoast' } });
  assert.equal(inst?.tenantId, 'testcoast');
  const email = await prisma.emailSettings.findUnique({ where: { id: 'testcoast' } });
  assert.equal(email?.tenantId, 'testcoast');

  const cycle = await prisma.academicCycle.findFirst({ where: { tenantId: 'testcoast', label: '2025/2026' } });
  assert.ok(cycle);
  assert.equal(cycle.tenantId, 'testcoast');
  assert.equal(cycle.institutionId, 'testcoast');
  assert.equal(cycle.label, '2025/2026');
  assert.equal(cycle.isCurrent, true);

  const user = await prisma.user.findUnique({ where: { email: 'ada@testcoast.example' } });
  assert.ok(user);
  assert.equal(user.tenantId, 'testcoast');
  const roles = await prisma.roleAssignment.findMany({ where: { userId: user.id } });
  assert.ok(roles.some((x) => x.role === 'COORDINATOR' && x.cycleId === '2025/2026'));
  assert.ok(roles.some((x) => x.role === 'ADMINISTRATOR'));

  // cleanup (user cascade removes credential + roles)
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.academicCycle.deleteMany({ where: { tenantId: 'testcoast' } });
  await prisma.emailSettings.delete({ where: { id: 'testcoast' } });
  await prisma.institution.delete({ where: { id: 'testcoast' } });
  await prisma.tenant.delete({ where: { id: 'testcoast' } });
});

test('createTenant rejects reserved slugs and duplicate emails', async () => {
  const reserved = await createTenant({
    name: 'X', slug: 'default', adminName: 'A', adminSurname: 'B',
    adminEmail: 'a@x.example', adminUsername: 'a', adminPassword: 'password123',
  });
  assert.equal(reserved.ok, false);

  const badSlug = await createTenant({
    name: 'X', slug: 'Bad Slug!', adminName: 'A', adminSurname: 'B',
    adminEmail: 'b@x.example', adminUsername: 'b', adminPassword: 'password123',
  });
  assert.equal(badSlug.ok, false);

  const shortPass = await createTenant({
    name: 'X', slug: 'okslug', adminName: 'A', adminSurname: 'B',
    adminEmail: 'c@x.example', adminUsername: 'c', adminPassword: 'short',
  });
  assert.equal(shortPass.ok, false);
});

test('setTenantSuspension toggles the suspendedAt timestamp', async () => {
  await prisma.tenant.upsert({
    where: { id: 'suspendme' },
    create: { id: 'suspendme', name: 'Suspend Me' },
    update: {},
  });
  await setTenantSuspension('suspendme', true);
  assert.ok((await prisma.tenant.findUnique({ where: { id: 'suspendme' } }))?.suspendedAt);
  await setTenantSuspension('suspendme', false);
  assert.equal((await prisma.tenant.findUnique({ where: { id: 'suspendme' } }))?.suspendedAt, null);
  await prisma.tenant.delete({ where: { id: 'suspendme' } });
});

test('createTenant defaults email provider from RESEND_API_KEY and inherits sender', async () => {
  process.env.RESEND_API_KEY = 're_test';
  await setStoredEmailSettings('default', {
    ...DEFAULT_EMAIL_SETTINGS, provider: 'resend', fromName: 'Host Sender', fromEmail: 'host@example.com',
  });
  try {
    const r = await createTenant({
      name: 'Resend Coast University',
      slug: 'resendcoast',
      adminName: 'Ada',
      adminSurname: 'Lovelace',
      adminEmail: 'ada@resendcoast.example',
      adminUsername: 'ada',
      adminPassword: 'password123',
      cycleLabel: '2025/2026',
    });
    assert.equal(r.ok, true);
    const email = await prisma.emailSettings.findUnique({ where: { id: 'resendcoast' } });
    assert.equal(email?.provider, 'resend');
    assert.equal(email?.fromName, 'Host Sender');
    assert.equal(email?.fromEmail, 'host@example.com');
  } finally {
    delete process.env.RESEND_API_KEY;
    await prisma.user.deleteMany({ where: { tenantId: 'resendcoast' } });
    await prisma.academicCycle.deleteMany({ where: { tenantId: 'resendcoast' } });
    await prisma.emailSettings.deleteMany({ where: { id: 'resendcoast' } });
    await prisma.institution.deleteMany({ where: { id: 'resendcoast' } });
    await prisma.tenant.deleteMany({ where: { id: 'resendcoast' } });
    await resetEmailForTests();
  }
});
