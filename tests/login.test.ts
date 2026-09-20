import test from 'node:test';
import assert from 'node:assert/strict';

import { hashPassword } from '../src/lib/auth/password';
import { login, type UserRecord, type LoginDeps, type LoginOutcome } from '../src/lib/auth/login';
import { resolveRoles, permissionsFor, requiresMfa, type RoleGrant } from '../src/lib/auth/roles';
import {
  issueSession, checkSession, principalFromSession, hashToken, tokenMatches,
} from '../src/lib/auth/session';
import { can } from '../src/lib/rbac/policy';

const NOW = new Date('2026-09-14T09:00:00Z');
const CYCLE = '2025/2026';
const grant = (over: Partial<RoleGrant> & Pick<RoleGrant, 'role'>): RoleGrant => ({
  cycleId: CYCLE, grantedAt: '2026-02-01T00:00:00Z', revokedAt: null, ...over,
});

let PASSWORD_HASH = '';
test('setup', async () => { PASSWORD_HASH = await hashPassword('a long enough passphrase'); });

function deps(overrides: Partial<LoginDeps> = {}, sink: unknown[] = []): LoginDeps {
  return {
    findUser: async () => null,
    recordFailure: async () => {},
    recordSuccess: async () => {},
    audit: async (e) => { sink.push(e); },
    ...overrides,
  };
}

function user(over: Partial<UserRecord> = {}): UserRecord {
  return {
    id: 'u-1', username: 'tmahlalela', status: 'ACTIVE', passwordHash: PASSWORD_HASH,
    failedAttempts: 0, lockedUntil: null, totpConfirmed: false,
    grants: [grant({ role: 'SUPERVISOR' }), grant({ role: 'ASSESSOR' })],
    ...over,
  };
}

const attempt = (u: UserRecord | null, password = 'a long enough passphrase', extra = {}, sink: unknown[] = []) =>
  login({ username: 'tmahlalela', password, cycleId: CYCLE, now: NOW, ...extra },
        deps({ findUser: async () => u }, sink));

/* ------------------------------------------------------- role resolution */

test('roles are scoped to the cycle — a previous year’s grant does not carry over', () => {
  const roles = resolveRoles(
    [grant({ role: 'SUPERVISOR', cycleId: '2024/2025' }), grant({ role: 'ASSESSOR' })],
    CYCLE, NOW,
  ).map((r) => r.role);
  assert.deepEqual(roles, ['ASSESSOR']);
});

test('a revoked grant is dropped, a future grant is not yet active', () => {
  const roles = resolveRoles([
    grant({ role: 'SUPERVISOR', revokedAt: '2026-08-01T00:00:00Z' }),
    grant({ role: 'MODERATOR', grantedAt: '2027-01-01T00:00:00Z' }),
    grant({ role: 'ASSESSOR' }),
  ], CYCLE, NOW).map((r) => r.role);
  assert.deepEqual(roles, ['ASSESSOR']);
});

test('an external examiner’s window closes on its own', () => {
  const open = grant({ role: 'EXTERNAL_EXAMINER', validUntil: '2026-10-01T00:00:00Z' });
  const shut = grant({ role: 'EXTERNAL_EXAMINER', validUntil: '2026-09-01T00:00:00Z' });
  assert.equal(resolveRoles([open], CYCLE, NOW).length, 1);
  assert.equal(resolveRoles([shut], CYCLE, NOW).length, 0);
});

test('cycle-scoped roles cannot be granted globally', () => {
  const roles = resolveRoles([
    grant({ role: 'COORDINATOR', cycleId: null }),
    grant({ role: 'ADMINISTRATOR', cycleId: null }),
  ], CYCLE, NOW).map((r) => r.role);
  assert.deepEqual(roles, ['ADMINISTRATOR']);
});

test('permissions are derived from the action matrix, so they cannot drift', () => {
  const supervisor = permissionsFor(['SUPERVISOR']);
  assert.ok(supervisor.includes('consultation.grade'));
  assert.ok(supervisor.includes('documentation.mark'));
  assert.ok(!supervisor.includes('mark.publish'));

  const student = permissionsFor(['STUDENT']);
  assert.deepEqual([...student], ['consultation.attest', 'consultation.book']);

  // Holding several roles unions their permissions, and nothing more.
  const combined = permissionsFor(['SUPERVISOR', 'ASSESSOR', 'MODERATOR']);
  assert.ok(combined.includes('presentation.moderate'));
  assert.ok(!combined.includes('config.edit'));
});

/* ------------------------------------------------------------ login gates */

test('a correct password issues a principal carrying resolved roles and permissions', async () => {
  const out = await attempt(user());
  assert.equal(out.status, 'OK');
  if (out.status !== 'OK') return;
  assert.deepEqual([...out.principal.roles], ['ASSESSOR', 'SUPERVISOR']);
  assert.ok(out.principal.permissions.includes('consultation.grade'));
  assert.equal(out.principal.cycleId, CYCLE);
});

test('an unknown user and a wrong password are indistinguishable', async () => {
  const unknown = await attempt(null);
  const wrong = await attempt(user(), 'not the passphrase');
  assert.equal(unknown.status, 'INVALID_CREDENTIALS');
  assert.equal(wrong.status, 'INVALID_CREDENTIALS');
  assert.deepEqual(Object.keys(unknown), Object.keys(wrong));
});

test('account status is only revealed to someone who holds the password', async () => {
  const withPassword = await attempt(user({ status: 'SUSPENDED' }));
  const without = await attempt(user({ status: 'SUSPENDED' }), 'wrong');
  assert.equal(withPassword.status, 'SUSPENDED');
  assert.equal(without.status, 'INVALID_CREDENTIALS');
});

test('a staff account awaiting approval cannot sign in', async () => {
  assert.equal((await attempt(user({ status: 'PENDING_APPROVAL' }))).status, 'PENDING_APPROVAL');
});

test('a locked account is refused before the password is even checked', async () => {
  const out = await attempt(user({ lockedUntil: '2026-09-14T09:30:00Z' }), 'wrong');
  assert.equal(out.status, 'LOCKED');
});

test('the tenth failure locks the account', async () => {
  const locks: (string | null)[] = [];
  await login({ username: 'x', password: 'wrong', cycleId: CYCLE, now: NOW },
    deps({ findUser: async () => user({ failedAttempts: 9 }),
           recordFailure: async (_id, until) => { locks.push(until); } }));
  assert.equal(locks.length, 1);
  assert.ok(locks[0] !== null, 'expected a lockout to be recorded');
});

test('an active account with no role for this cycle gets no session', async () => {
  const out = await attempt(user({ grants: [grant({ role: 'SUPERVISOR', cycleId: '2024/2025' })] }));
  assert.equal(out.status, 'NO_ACTIVE_ROLES');
});

/* -------------------------------------------------------------- MFA gates */

test('a coordinator must pass a second factor', async () => {
  const u = user({ grants: [grant({ role: 'COORDINATOR' })], totpConfirmed: true });
  assert.equal((await attempt(u)).status, 'MFA_REQUIRED');
  assert.equal((await attempt(u, undefined, { mfaVerified: true })).status, 'OK');
});

test('a privileged role without enrolled TOTP is sent to enrolment, not let through', async () => {
  const u = user({ grants: [grant({ role: 'ADMINISTRATOR', cycleId: null })], totpConfirmed: false });
  assert.equal((await attempt(u, undefined, { mfaVerified: true })).status, 'MFA_ENROLMENT_REQUIRED');
});

test('an unprivileged user is not asked for a second factor', async () => {
  assert.equal(requiresMfa(['SUPERVISOR', 'ASSESSOR']), false);
  assert.equal((await attempt(user())).status, 'OK');
});

/* ------------------------------------------------------------- audit trail */

test('every outcome is audited, success and failure alike', async () => {
  const sink: Array<{ action: string }> = [];
  await attempt(user(), 'wrong', {}, sink as unknown[]);
  await attempt(user(), undefined, {}, sink as unknown[]);
  assert.deepEqual(sink.map((e) => e.action), ['auth.login.failed', 'auth.login.succeeded']);
});

/* ---------------------------------------------------------------- sessions */

test('the session token is stored only as a hash', () => {
  const s = issueSession('u-1', NOW, false, 'sess-1');
  assert.notEqual(s.record.tokenHash, s.token);
  assert.equal(s.record.tokenHash, hashToken(s.token));
  assert.ok(tokenMatches(s.token, s.record.tokenHash));
  assert.ok(!tokenMatches('forged', s.record.tokenHash));
});

test('sessions expire absolutely and on idle', () => {
  const s = issueSession('u-1', NOW, false, 'sess-1');
  assert.equal(checkSession(s.record, s.token, new Date('2026-09-14T09:30:00Z')).valid, true);

  const idle = checkSession(s.record, s.token, new Date('2026-09-14T10:30:00Z'));
  assert.equal(idle.valid, false);
  if (!idle.valid) assert.equal(idle.reason, 'IDLE_TIMEOUT');

  const fresh = { ...s.record, lastSeenAt: '2026-09-14T20:30:00Z' };
  const expired = checkSession(fresh, s.token, new Date('2026-09-14T21:05:00Z'));
  assert.equal(expired.valid, false);
  if (!expired.valid) assert.equal(expired.reason, 'EXPIRED');
});

test('revoking a role takes effect mid-session, without waiting for re-login', () => {
  const s = issueSession('u-1', NOW, false, 'sess-1');
  const before = principalFromSession(s.record, [grant({ role: 'SUPERVISOR' })], CYCLE, NOW);
  assert.ok(before);
  assert.equal(can(before!, 'consultation.grade', { supervisorId: 'u-1' }).allow, true);

  const after = principalFromSession(
    s.record, [grant({ role: 'SUPERVISOR', revokedAt: '2026-09-14T08:00:00Z' })], CYCLE, NOW,
  );
  assert.equal(after, null, 'a revoked grant must not survive in an open session');
});

test('a privileged role granted mid-session cannot be used without a second factor', () => {
  const s = issueSession('u-1', NOW, false, 'sess-1'); // signed in without MFA
  const escalated = principalFromSession(s.record, [grant({ role: 'COORDINATOR' })], CYCLE, NOW);
  assert.equal(escalated, null);

  const withMfa = issueSession('u-1', NOW, true, 'sess-2');
  assert.ok(principalFromSession(withMfa.record, [grant({ role: 'COORDINATOR' })], CYCLE, NOW));
});

test('the principal from a session enforces the same separation of duty', () => {
  const s = issueSession('u-1', NOW, false, 'sess-1');
  const p = principalFromSession(
    s.record, [grant({ role: 'SUPERVISOR' }), grant({ role: 'MODERATOR' })], CYCLE, NOW,
  )!;
  assert.equal(can(p, 'presentation.moderate', { originatingMarkerId: 'u-1' }).allow, false);
  assert.equal(can(p, 'presentation.moderate', { originatingMarkerId: 'u-2' }).allow, true);
});
