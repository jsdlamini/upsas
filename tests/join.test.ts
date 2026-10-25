import { test } from 'node:test';
import assert from 'node:assert/strict';

import { prisma } from '../src/lib/prisma';
import { createTenant } from '../src/lib/tenant-provisioning';
import { loadJoinInstitution, joinStudent, joinStaff } from '../src/lib/join';
import { findUserPrisma } from '../src/lib/auth/prisma-auth';
import { principalForSessionRecord } from '../src/lib/auth/principal';
import { issueSession } from '../src/lib/auth/session';

const SLUG = 'jointest';
const ADMIN_EMAIL = 'admin@jointest.example';
const ADMIN_PASSWORD = 'Purple#Tree88';

async function seedTenant() {
  const r = await createTenant({
    name: 'Join Test College',
    slug: SLUG,
    adminName: 'J',
    adminSurname: 'Admin',
    adminEmail: ADMIN_EMAIL,
    adminUsername: 'jadmin',
    adminPassword: ADMIN_PASSWORD,
  });
  assert.equal(r.ok, true);
}

async function cleanup() {
  const users = await prisma.user.findMany({ where: { tenantId: SLUG } });
  for (const u of users) await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
  await prisma.institution.deleteMany({ where: { id: SLUG } }).catch(() => {});
  await prisma.emailSettings.deleteMany({ where: { id: SLUG } }).catch(() => {});
  await prisma.tenant.deleteMany({ where: { id: SLUG } }).catch(() => {});
}

test('loadJoinInstitution resolves an existing tenant and rejects unknown slugs', async () => {
  await cleanup();
  try {
    await seedTenant();
    const info = await loadJoinInstitution(SLUG);
    assert.ok(info, 'known slug must resolve');
    assert.equal(info.name, 'Join Test College');
    assert.equal(info.suspended, false);
    assert.equal(await loadJoinInstitution('does-not-exist'), null);
  } finally {
    await cleanup();
  }
});

test('joinStudent registers a student bound to the institution tenant', async () => {
  await cleanup();
  try {
    await seedTenant();

    const r = await joinStudent({
      slug: SLUG,
      studentNumber: '202511001',
      surname: 'Ngwenya',
      otherNames: 'Sipho',
      programme: 'BSc IT',
      courseCode: 'CSC 499',
      email: 'sipho@jointest.example',
      password: 'correct horse battery staple',
    });
    assert.equal(r.ok, true);

    const user = await findUserPrisma('sipho@jointest.example');
    assert.ok(user, 'joined student must be found by email');
    assert.equal(user.tenantId, SLUG);
    assert.equal(user.status, 'ACTIVE');
    assert.deepEqual(user.grants.map((g) => g.role), ['STUDENT']);

    const profile = await prisma.studentProfile.findUnique({ where: { studentNumber: '202511001' } });
    assert.ok(profile, 'joined student must have a StudentProfile');
    assert.equal(profile.tenantId, SLUG);
    assert.equal(profile.programmeName, 'BSc IT');

    const now = new Date();
    const session = issueSession(user.id, now, false, 'sess-join-student');
    const principal = await principalForSessionRecord(session.record, now);
    assert.ok(principal, 'joined student must resolve to a principal');
    assert.equal(principal.tenantId, SLUG);
  } finally {
    await cleanup();
  }
});

test('joinStudent rejects duplicate email, malformed number and weak password', async () => {
  await cleanup();
  try {
    await seedTenant();

    const first = await joinStudent({
      slug: SLUG,
      studentNumber: '202511002',
      surname: 'Dube',
      otherNames: 'Nomsa',
      programme: 'BSc IT',
      courseCode: 'CSC 499',
      email: 'nomsa@jointest.example',
      password: 'correct horse battery staple',
    });
    assert.equal(first.ok, true);

    const dupEmail = await joinStudent({
      slug: SLUG,
      studentNumber: '202511003',
      surname: 'Other',
      otherNames: 'Person',
      programme: 'BSc IT',
      courseCode: 'CSC 499',
      email: 'nomsa@jointest.example',
      password: 'correct horse battery staple',
    });
    assert.equal(dupEmail.ok, false);

    const badNumber = await joinStudent({
      slug: SLUG,
      studentNumber: '991',
      surname: 'Dube',
      otherNames: 'Nomsa',
      programme: 'BSc IT',
      courseCode: 'CSC 499',
      email: 'x@jointest.example',
      password: 'correct horse battery staple',
    });
    assert.equal(badNumber.ok, false);

    const weak = await joinStudent({
      slug: SLUG,
      studentNumber: '202511004',
      surname: 'Dube',
      otherNames: 'Nomsa',
      programme: 'BSc IT',
      courseCode: 'CSC 499',
      email: 'y@jointest.example',
      password: 'short',
    });
    assert.equal(weak.ok, false);
  } finally {
    await cleanup();
  }
});

test('joinStaff creates a pending account with the requested roles recorded', async () => {
  await cleanup();
  try {
    await seedTenant();

    const r = await joinStaff({
      slug: SLUG,
      username: 'newsupervisor',
      surname: 'Supervisor',
      otherNames: 'Dr New',
      email: 'new@jointest.example',
      requestedRoles: ['SUPERVISOR', 'ASSESSOR'],
      justification: 'Supervising CSC 400 students this cycle.',
    });
    assert.equal(r.ok, true);

    const user = await findUserPrisma('new@jointest.example');
    assert.ok(user, 'joined staff must be found by email');
    assert.equal(user.tenantId, SLUG);
    assert.equal(user.status, 'PENDING_APPROVAL');
    assert.deepEqual([...user.grants.map((g) => g.role)].sort(), ['ASSESSOR', 'SUPERVISOR']);
  } finally {
    await cleanup();
  }
});
