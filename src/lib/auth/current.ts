import { cookies } from 'next/headers';
import { issueSession, checkSession, principalFromSession, type SessionRecord } from './session';
import type { AuthenticatedPrincipal } from './login';
import { CYCLE, findPerson } from '../data/store';
import { prisma } from '../prisma';
import { authPrismaAvailable } from './prisma-auth';

/**
 * Process-local session cache, backed by the AuthSession table.
 *
 * The Map remains the fast path; Postgres is the durable copy so a restart
 * (deploy) no longer signs everyone out. Reads fall back to Postgres when the
 * process-local entry is missing, and writes are best-effort so a database
 * blip never prevents a sign-in.
 */
const globalForSessions = globalThis as unknown as { __upsasSessions?: Map<string, SessionRecord> };
const SESSIONS: Map<string, SessionRecord> = (globalForSessions.__upsasSessions ??= new Map());
export const COOKIE = 'upsas_session';

async function prismaOk(): Promise<boolean> {
  try {
    return await authPrismaAvailable();
  } catch {
    return false;
  }
}

async function persistSession(record: SessionRecord): Promise<void> {
  try {
    await prisma.authSession.create({
      data: {
        id: record.id,
        userId: record.userId,
        tokenHash: record.tokenHash,
        issuedAt: new Date(record.issuedAt),
        lastSeenAt: new Date(record.lastSeenAt),
        expiresAt: new Date(record.expiresAt),
        revokedAt: record.revokedAt ? new Date(record.revokedAt) : null,
        mfaSatisfied: record.mfaSatisfied,
      },
    });
  } catch {
    /* best-effort */
  }
}

async function loadSessionFromPrisma(id: string): Promise<SessionRecord | null> {
  try {
    const row = await prisma.authSession.findUnique({ where: { id } });
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      tokenHash: row.tokenHash,
      issuedAt: row.issuedAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
      mfaSatisfied: row.mfaSatisfied,
    };
  } catch {
    return null;
  }
}

export function createSession(userId: string, mfaSatisfied: boolean) {
  const issued = issueSession(userId, new Date(), mfaSatisfied);
  SESSIONS.set(issued.record.id, issued.record);
  void persistSession(issued.record);
  return issued;
}

export function destroySession(id: string): void {
  SESSIONS.delete(id);
  void prisma.authSession.update({ where: { id }, data: { revokedAt: new Date() } }).catch(() => {});
}

/**
 * End every session an account holds.
 *
 * Called after a password reset, and available to an administrator when an
 * account is compromised or a member of staff leaves. A forgotten password and
 * a stolen one look identical from here, so the safe assumption after a reset
 * is that somebody else may be signed in.
 */
export function destroySessionsFor(userId: string): number {
  let ended = 0;
  for (const [id, record] of SESSIONS) {
    if (record.userId !== userId) continue;
    SESSIONS.delete(id);
    ended += 1;
  }
  void prisma.authSession
    .updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
    .catch(() => {});
  return ended;
}

/**
 * Rebuilds the principal from live grants on every request. A role revoked a
 * moment ago is gone from the next page load, not from the next sign-in.
 */
export async function currentPrincipal(): Promise<AuthenticatedPrincipal | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  const [id, token] = raw.split('.');
  if (!id || !token) return null;

  let record: SessionRecord | null | undefined = SESSIONS.get(id);
  if (!record) {
    record = await loadSessionFromPrisma(id);
    if (record) SESSIONS.set(id, record);
  }
  if (!record) return null;

  const now = new Date();
  const check = checkSession(record, token, now);
  if (!check.valid) return null;

  const lastSeen = now.toISOString();
  SESSIONS.set(id, { ...record, lastSeenAt: lastSeen });
  void prisma.authSession
    .update({ where: { id }, data: { lastSeenAt: new Date(lastSeen) } })
    .catch(() => {});

  const person = findPerson(record.userId);
  if (!person) return null;
  const user = await prisma.user.findUnique({ where: { id: record.userId }, select: { tenantId: true } });
  if (!user) return null;
  const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { suspendedAt: true } });
  if (tenant?.suspendedAt) return null; // a suspended tenant signs no one in
  return principalFromSession(record, person.grants, CYCLE, now, user.tenantId);
}
