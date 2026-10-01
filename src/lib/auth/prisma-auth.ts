import { prisma } from '../prisma';
import type { UserRecord, AccountStatus } from './login';
import type { RoleGrant } from './roles';
import type { RoleCode } from '../rbac/policy';
import type { Person } from '../data/store';
import { GENESIS_HASH, chain } from '../audit/hashchain';

/**
 * Prisma-backed auth adapter.
 *
 * The in-memory store remains the source of truth for working data, but the
 * identity decisions — who may sign in, how many times they failed, and what
 * happened — now live in the Prisma User / RoleAssignment / AuditEvent tables
 * so they survive a restart and are genuinely append-only.
 */

export async function authPrismaAvailable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/** Upsert the in-memory people into Prisma identity tables. Idempotent. */
async function upsertUser(p: Person, hash: string): Promise<void> {
  const email = p.email || `${p.username}@localhost`;
  const status: AccountStatus = (p.status as AccountStatus) || 'ACTIVE';

  await prisma.user.upsert({
    where: { username: p.username },
    create: {
      id: p.id,
      username: p.username,
      email,
      fullName: p.fullName,
      surname: p.surname,
      status,
      credential: { create: { hash } },
      ...(p.totpConfirmed && p.totpSecret
        ? { totp: { create: { secretEnc: p.totpSecret, confirmedAt: new Date() } } }
        : {}),
    },
    update: {
      email,
      fullName: p.fullName,
      surname: p.surname,
      status,
      credential: { upsert: { create: { hash }, update: { hash } } },
      ...(p.totpConfirmed && p.totpSecret
        ? {
            totp: {
              upsert: {
                create: { secretEnc: p.totpSecret, confirmedAt: new Date() },
                update: { secretEnc: p.totpSecret, confirmedAt: new Date() },
              },
            },
          }
        : {}),
    },
  });

  await prisma.roleAssignment.deleteMany({ where: { userId: p.id } });
  for (const g of p.grants) {
    await prisma.roleAssignment.create({
      data: {
        userId: p.id,
        role: g.role as RoleCode,
        cycleId: g.cycleId,
        grantedBy: 'seed',
        grantedAt: new Date(g.grantedAt),
        revokedAt: g.revokedAt ? new Date(g.revokedAt) : null,
      },
    });
  }
}

export async function syncUsersToPrisma(
  people: Person[],
  hashFor: (username: string) => Promise<string>,
): Promise<void> {
  const seen = new Set<string>();
  for (const p of people) {
    // PEOPLE (seeded staff) come first in allPeople(); skip a later
    // registered-staff duplicate so the seeded role set wins.
    if (seen.has(p.username)) continue;
    seen.add(p.username);
    try {
      await upsertUser(p, await hashFor(p.username));
    } catch (error) {
      console.error('[prisma-auth] sync skip', p.username, error instanceof Error ? error.message : String(error));
    }
  }
}

/** Sync a single person on demand (e.g. a student who registered after the initial sync). */
export async function syncOneUserToPrisma(person: Person, hash: string): Promise<void> {
  await upsertUser(person, hash);
}

export async function findUserPrisma(identifier: string): Promise<UserRecord | null> {
  const value = identifier.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: { OR: [{ username: value }, { email: value }] },
    include: { credential: true, totp: true, roles: true },
  });
  if (!user) return null;

  return {
    id: user.id,
    username: user.username,
    status: user.status as AccountStatus,
    passwordHash: user.credential?.hash ?? '',
    failedAttempts: user.failedAttempts,
    lockedUntil: user.lockedUntil ? user.lockedUntil.toISOString() : null,
    totpConfirmed: Boolean(user.totp?.confirmedAt),
    grants: user.roles.map((r) => ({
      role: r.role as RoleCode,
      cycleId: r.cycleId,
      grantedAt: r.grantedAt.toISOString(),
      revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
    })) as RoleGrant[],
  };
}

export async function totpSecretForPrisma(identifier: string): Promise<string> {
  const value = identifier.trim().toLowerCase();
  const user = await prisma.user.findFirst({ where: { OR: [{ username: value }, { email: value }] }, include: { totp: true } });
  return user?.totp?.secretEnc ?? '';
}

const globalForSync = globalThis as unknown as { __upsasUsersSynced?: boolean };

/** Sync in-memory people into Prisma once per process. */
export async function ensureUsersSynced(
  people: Person[],
  hashFor: (username: string) => Promise<string>,
): Promise<void> {
  if (globalForSync.__upsasUsersSynced) return;
  globalForSync.__upsasUsersSynced = true;
  await syncUsersToPrisma(people, hashFor);
}

export async function recordFailurePrisma(userId: string, lockUntil: string | null): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { failedAttempts: { increment: 1 }, lockedUntil: lockUntil ? new Date(lockUntil) : null },
    });
  } catch {
    /* best-effort */
  }
}

export async function recordSuccessPrisma(userId: string, at: string): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date(at), failedAttempts: 0, lockedUntil: null },
    });
  } catch {
    /* best-effort */
  }
}

export async function recordAuditPrisma(event: {
  action: string;
  actorId: string | null;
  entityId: string;
  detail: Record<string, unknown>;
}): Promise<void> {
  const latest = await prisma.auditEvent.findFirst({ orderBy: { sequence: 'desc' } });
  const previousHash = latest?.entryHash ?? GENESIS_HASH;
  const sequence = latest ? latest.sequence + 1n : 0n;
  const occurredAt = new Date();

  const chained = chain(
    {
      sequence,
      occurredAt: occurredAt.toISOString(),
      actorId: event.actorId,
      action: event.action,
      entityType: 'auth',
      entityId: event.entityId,
      before: null,
      after: event.detail,
    },
    previousHash,
  );

  await prisma.auditEvent.create({
    data: {
      sequence,
      occurredAt,
      actorId: event.actorId,
      action: event.action,
      entityType: 'auth',
      entityId: event.entityId,
      after: event.detail as object,
      previousHash: chained.previousHash,
      entryHash: chained.entryHash,
    },
  });
}
