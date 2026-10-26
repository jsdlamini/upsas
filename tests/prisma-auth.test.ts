import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/prisma';
import { createTenant } from '../src/lib/tenant-provisioning';
import { findUserPrisma, findUserPrismaById, updateUserProfilePrisma } from '../src/lib/auth/prisma-auth';
import { principalForSessionRecord, identityFor } from '../src/lib/auth/principal';
import { issueSession } from '../src/lib/auth/session';

const NOW = new Date();
const SLUG = 'testcollege';
const EMAIL = 'admin@testcollege.example';

async function cleanup() {
  const user = await prisma.user.findUnique({ where: { id: `u-${SLUG}-admin` } });
  if (user) await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  const byEmail = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (byEmail) await prisma.user.delete({ where: { id: byEmail.id } }).catch(() => {});
  await prisma.academicCycle.deleteMany({ where: { tenantId: SLUG } }).catch(() => {});
  await prisma.institution.deleteMany({ where: { id: SLUG } }).catch(() => {});
  await prisma.emailSettings.deleteMany({ where: { id: SLUG } }).catch(() => {});
  await prisma.tenant.deleteMany({ where: { id: SLUG } }).catch(() => {});
}

test('a self-serve admin that exists only in Postgres resolves to a principal', async () => {
  await cleanup();
  try {
    const created = await createTenant({
      name: 'Test College',
      slug: SLUG,
      adminName: 'Test',
      adminSurname: 'Admin',
      adminEmail: EMAIL,
      adminUsername: 'testadmin',
      adminPassword: 'Purple#Tree88',
    });
    assert.equal(created.ok, true);

    const user = await findUserPrisma(EMAIL);
    assert.ok(user, 'admin must be found by email in Prisma');
    assert.equal(user.id, 'u-testcollege-admin');

    // The gap: this account is not in the in-memory people store, so the
    // session reconstruction must read grants from Prisma RoleAssignment.
    const byId = await findUserPrismaById(user.id);
    assert.ok(byId, 'admin must be found by id in Prisma');
    assert.deepEqual([...byId.grants.map((g) => g.role)].sort(), ['ADMINISTRATOR', 'COORDINATOR']);

    // Resolve against a clock that is at or after the account's grantedAt.
    const now = new Date();
    const session = issueSession(user.id, now, true, 'sess-testcollege');
    const principal = await principalForSessionRecord(session.record, now);
    assert.ok(principal, 'session must resolve to a principal');
    assert.equal(principal.tenantId, SLUG);
    assert.deepEqual([...principal.roles].sort(), ['ADMINISTRATOR', 'COORDINATOR']);

    const identity = await identityFor(user.id);
    assert.ok(identity, 'identity must resolve from Prisma');
    assert.equal(identity.fullName, 'Test Admin');
    assert.equal(identity.studentId, null);
  } finally {
    await cleanup();
  }
});

test('an unknown session user resolves to nothing rather than crashing', async () => {
  const session = issueSession('u-does-not-exist', NOW, true, 'sess-missing');
  assert.equal(await principalForSessionRecord(session.record, NOW), null);
});

test('identityFor carries the login username for in-memory and Prisma-only users', async () => {
  const mem = await identityFor('u-mahlalela');
  assert.ok(mem, 'in-memory person must resolve');
  assert.equal(mem.username, 'tmahlalela');

  await cleanup();
  try {
    const created = await createTenant({
      name: 'Test College',
      slug: SLUG,
      adminName: 'Test',
      adminSurname: 'Admin',
      adminEmail: EMAIL,
      adminUsername: 'testadmin',
      adminPassword: 'Purple#Tree88',
    });
    assert.equal(created.ok, true);

    const user = await findUserPrisma(EMAIL);
    assert.ok(user, 'admin must be found by email in Prisma');
    const identity = await identityFor(user.id);
    assert.ok(identity, 'Prisma-only identity must resolve');
    assert.equal(identity.username, 'testadmin');
  } finally {
    await cleanup();
  }
});

test('updateUserProfilePrisma writes name and email to the User row', async () => {
  await cleanup();
  try {
    const created = await createTenant({
      name: 'Test College',
      slug: SLUG,
      adminName: 'Test',
      adminSurname: 'Admin',
      adminEmail: EMAIL,
      adminUsername: 'testadmin',
      adminPassword: 'Purple#Tree88',
    });
    assert.equal(created.ok, true);

    const user = await findUserPrisma(EMAIL);
    assert.ok(user);
    const res = await updateUserProfilePrisma(user.id, {
      fullName: 'Renamed Admin',
      surname: 'Renamed',
      email: 'renamed@testcollege.example',
    });
    assert.equal(res.ok, true);

    const fresh = await prisma.user.findUnique({ where: { id: user.id } });
    assert.equal(fresh?.fullName, 'Renamed Admin');
    assert.equal(fresh?.surname, 'Renamed');
    assert.equal(fresh?.email, 'renamed@testcollege.example');
  } finally {
    await cleanup();
  }
});
