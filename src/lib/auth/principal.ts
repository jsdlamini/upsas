import { principalFromSession, type SessionRecord } from './session';
import type { AuthenticatedPrincipal } from './login';
import type { RoleGrant } from './roles';
import { findPerson } from '../data/store';
import { prisma } from '../prisma';
import { findUserPrismaById } from './prisma-auth';
import { currentCycleId } from '../cycles';

/**
 * Resolve a session record back into a principal, reading live grants from the
 * right source for the account. In-memory people remain the fast path (their
 * grants reflect role overrides), while self-serve institution admins exist
 * only in Postgres and are resolved from the RoleAssignment table.
 */
export async function principalForSessionRecord(
  record: SessionRecord,
  now: Date,
): Promise<AuthenticatedPrincipal | null> {
  const person = findPerson(record.userId);
  let grants: readonly RoleGrant[] = person?.grants ?? [];
  if (!person) {
    // In-memory mode has no identity table: only seeded people hold sessions.
    if (!process.env.DATABASE_URL) return null;
    const identity = await findUserPrismaById(record.userId);
    if (!identity) return null;
    grants = identity.grants;
  }

  // No database means the single-tenant in-memory store: the session was
  // created there with tenant 'default', so resolve against that directly.
  if (!process.env.DATABASE_URL) {
    const cycleId = await currentCycleId('default');
    return principalFromSession(record, grants, cycleId, now, 'default');
  }

  const user = await prisma.user.findUnique({ where: { id: record.userId }, select: { tenantId: true } });
  if (!user) return null;
  const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { suspendedAt: true } });
  if (tenant?.suspendedAt) return null; // a suspended tenant signs no one in
  const cycleId = await currentCycleId(user.tenantId);
  return principalFromSession(record, grants, cycleId, now, user.tenantId);
}

/** Display identity for the signed-in user, falling back to Postgres. */
export async function identityFor(
  userId: string,
): Promise<{ fullName: string; surname: string; email: string | null; studentId: string | null } | null> {
  const person = findPerson(userId);
  if (person) {
    return {
      fullName: person.fullName,
      surname: person.surname,
      email: person.email ?? null,
      studentId: person.studentId ?? null,
    };
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;
    return { fullName: user.fullName, surname: user.surname, email: user.email, studentId: null };
  } catch {
    return null;
  }
}
