import { ACTION_ROLES, type Action, type RoleCode } from '../rbac/policy';

/**
 * Role and permission resolution.
 *
 * Roles are NOT baked into a session token at login. A grant can be revoked, a
 * cycle can roll over, and an external examiner's window can close while someone
 * is still signed in; a token minted an hour ago would carry authority that no
 * longer exists. The session carries identity, and the principal is resolved
 * from live grants on each request.
 */

export interface RoleGrant {
  readonly role: RoleCode;
  /** null means the grant applies to every cycle — administrators only. */
  readonly cycleId: string | null;
  readonly grantedAt: string;
  readonly revokedAt: string | null;
  /** External examiners get a time-boxed window. */
  readonly validUntil?: string | null;
}

export interface ResolvedRole {
  readonly role: RoleCode;
  readonly cycleId: string | null;
  readonly expiresAt: string | null;
}

/** Roles that must never be granted globally — they are always cycle-scoped. */
const CYCLE_SCOPED_ONLY: readonly RoleCode[] = [
  'STUDENT', 'SUPERVISOR', 'ASSESSOR', 'MODERATOR', 'COORDINATOR', 'EXTERNAL_EXAMINER',
];

/** Roles that require a second factor before any session becomes usable. */
export const MFA_REQUIRED_ROLES: readonly RoleCode[] = ['COORDINATOR', 'ADMINISTRATOR'];

export function resolveRoles(
  grants: readonly RoleGrant[],
  cycleId: string,
  now: Date,
): readonly ResolvedRole[] {
  const iso = now.toISOString();
  const out: ResolvedRole[] = [];

  for (const g of grants) {
    if (g.revokedAt !== null && g.revokedAt <= iso) continue;
    if (g.grantedAt > iso) continue;
    if (g.validUntil && g.validUntil <= iso) continue;
    if (g.cycleId !== null && g.cycleId !== cycleId) continue;
    if (g.cycleId === null && CYCLE_SCOPED_ONLY.includes(g.role)) continue;
    if (out.some((r) => r.role === g.role)) continue;
    out.push({ role: g.role, cycleId: g.cycleId, expiresAt: g.validUntil ?? null });
  }

  return out.sort((a, b) => a.role.localeCompare(b.role));
}

/** Derived from the action matrix, never maintained separately. */
export function permissionsFor(roles: readonly RoleCode[]): readonly Action[] {
  return (Object.keys(ACTION_ROLES) as Action[])
    .filter((action) => ACTION_ROLES[action].some((r) => roles.includes(r)))
    .sort();
}

export function requiresMfa(roles: readonly RoleCode[]): boolean {
  return roles.some((r) => MFA_REQUIRED_ROLES.includes(r));
}
