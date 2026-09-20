import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { resolveRoles, permissionsFor, requiresMfa, type RoleGrant } from './roles';
import type { AuthenticatedPrincipal } from './login';

/**
 * Sessions carry identity, never authority.
 *
 * The stored record holds a user id and nothing about what that user may do.
 * Permissions are rebuilt from live grants on every request, so revoking a role
 * takes effect immediately rather than at the next sign-in.
 */

export const SESSION_POLICY = {
  absoluteHours: 12,
  idleMinutes: 60,
} as const;

export interface SessionRecord {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly issuedAt: string;
  readonly lastSeenAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
  readonly mfaSatisfied: boolean;
}

export interface IssuedSession {
  readonly record: SessionRecord;
  /** Returned to the client once and never stored in plaintext. */
  readonly token: string;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function issueSession(
  userId: string, now: Date, mfaSatisfied: boolean, id = randomBytes(8).toString('hex'),
): IssuedSession {
  const token = randomBytes(32).toString('base64url');
  const iso = now.toISOString();
  return {
    token,
    record: {
      id, userId, tokenHash: hashToken(token), issuedAt: iso, lastSeenAt: iso,
      expiresAt: new Date(now.getTime() + SESSION_POLICY.absoluteHours * 3_600_000).toISOString(),
      revokedAt: null, mfaSatisfied,
    },
  };
}

export function tokenMatches(token: string, storedHash: string): boolean {
  const a = Buffer.from(hashToken(token), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export type SessionCheck =
  | { readonly valid: true; readonly record: SessionRecord }
  | { readonly valid: false; readonly reason: 'REVOKED' | 'EXPIRED' | 'IDLE_TIMEOUT' | 'BAD_TOKEN' };

export function checkSession(record: SessionRecord, token: string, now: Date): SessionCheck {
  if (!tokenMatches(token, record.tokenHash)) return { valid: false, reason: 'BAD_TOKEN' };
  const iso = now.toISOString();
  if (record.revokedAt !== null && record.revokedAt <= iso) return { valid: false, reason: 'REVOKED' };
  if (record.expiresAt <= iso) return { valid: false, reason: 'EXPIRED' };
  const idleMs = now.getTime() - new Date(record.lastSeenAt).getTime();
  if (idleMs > SESSION_POLICY.idleMinutes * 60_000) return { valid: false, reason: 'IDLE_TIMEOUT' };
  return { valid: true, record };
}

/**
 * Rebuild the principal from current grants. Called on every authenticated
 * request — this is what makes a mid-session revocation take effect.
 */
export function principalFromSession(
  record: SessionRecord, grants: readonly RoleGrant[], cycleId: string, now: Date,
): AuthenticatedPrincipal | null {
  const resolved = resolveRoles(grants, cycleId, now);
  const roles = resolved.map((r) => r.role);
  if (roles.length === 0) return null;
  // A role that demands a second factor cannot be exercised from a session that
  // never satisfied one — including a role granted after the session began.
  if (requiresMfa(roles) && !record.mfaSatisfied) return null;
  return {
    userId: record.userId, roles, resolvedRoles: resolved,
    permissions: permissionsFor(roles), cycleId, mfaSatisfied: record.mfaSatisfied,
  };
}
