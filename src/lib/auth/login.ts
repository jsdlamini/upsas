import { verifyPassword, LOCKOUT } from './password';
import { resolveRoles, permissionsFor, requiresMfa, type RoleGrant, type ResolvedRole } from './roles';
import type { Action, Principal, RoleCode } from '../rbac/policy';

/**
 * Authentication is local: this function is the whole identity decision. There
 * is no external verifier to defer to, so every gate — account status, lockout,
 * second factor, role resolution — is enforced here.
 */

export type AccountStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

export interface UserRecord {
  readonly id: string;
  readonly username: string;
  readonly status: AccountStatus;
  readonly passwordHash: string;
  readonly failedAttempts: number;
  readonly lockedUntil: string | null;
  readonly totpConfirmed: boolean;
  readonly grants: readonly RoleGrant[];
}

export interface AuthenticatedPrincipal extends Principal {
  readonly resolvedRoles: readonly ResolvedRole[];
  readonly permissions: readonly Action[];
  readonly cycleId: string;
  readonly mfaSatisfied: boolean;
}

export type LoginOutcome =
  | { readonly status: 'OK'; readonly principal: AuthenticatedPrincipal }
  | { readonly status: 'MFA_REQUIRED'; readonly userId: string; readonly roles: readonly RoleCode[] }
  | { readonly status: 'MFA_ENROLMENT_REQUIRED'; readonly userId: string }
  | { readonly status: 'PENDING_APPROVAL' }
  | { readonly status: 'LOCKED'; readonly until: string }
  | { readonly status: 'SUSPENDED' }
  | { readonly status: 'DEACTIVATED' }
  | { readonly status: 'NO_ACTIVE_ROLES' }
  | { readonly status: 'INVALID_CREDENTIALS' };

export interface LoginRequest {
  readonly username: string;
  readonly password: string;
  readonly cycleId: string;
  readonly now: Date;
  /** Present only after a TOTP challenge has been verified. */
  readonly mfaVerified?: boolean;
}

export interface LoginDeps {
  readonly findUser: (username: string) => Promise<UserRecord | null>;
  readonly recordFailure: (userId: string, lockUntil: string | null) => Promise<void>;
  readonly recordSuccess: (userId: string, at: string) => Promise<void>;
  readonly audit: (event: {
    action: string; actorId: string | null; entityId: string; detail: Record<string, unknown>;
  }) => Promise<void>;
}

export async function login(req: LoginRequest, deps: LoginDeps): Promise<LoginOutcome> {
  const iso = req.now.toISOString();
  const user = await deps.findUser(req.username);

  // Unknown username and wrong password return the same outcome. Distinguishing
  // them would let anyone enumerate staff and student accounts.
  if (!user) {
    await deps.audit({ action: 'auth.login.failed', actorId: null, entityId: req.username,
                       detail: { reason: 'NO_SUCH_USER' } });
    return { status: 'INVALID_CREDENTIALS' };
  }

  if (user.lockedUntil && user.lockedUntil > iso) {
    await deps.audit({ action: 'auth.login.blocked', actorId: user.id, entityId: user.id,
                       detail: { reason: 'LOCKED', until: user.lockedUntil } });
    return { status: 'LOCKED', until: user.lockedUntil };
  }

  const passwordOk = await verifyPassword(user.passwordHash, req.password);
  if (!passwordOk) {
    const attempts = user.failedAttempts + 1;
    const lockUntil = attempts >= LOCKOUT.maxFailedAttempts
      ? new Date(req.now.getTime() + LOCKOUT.lockoutMinutes * 60_000).toISOString()
      : null;
    await deps.recordFailure(user.id, lockUntil);
    await deps.audit({ action: 'auth.login.failed', actorId: user.id, entityId: user.id,
                       detail: { reason: 'BAD_PASSWORD', attempts, locked: lockUntil !== null } });
    return { status: 'INVALID_CREDENTIALS' };
  }

  // Status is checked only after the password verifies, so the outcome never
  // reveals whether an account exists to someone who does not hold its password.
  switch (user.status) {
    case 'PENDING_APPROVAL':
      await deps.audit({ action: 'auth.login.blocked', actorId: user.id, entityId: user.id,
                         detail: { reason: 'PENDING_APPROVAL' } });
      return { status: 'PENDING_APPROVAL' };
    case 'SUSPENDED':
      await deps.audit({ action: 'auth.login.blocked', actorId: user.id, entityId: user.id,
                         detail: { reason: 'SUSPENDED' } });
      return { status: 'SUSPENDED' };
    case 'DEACTIVATED':
      await deps.audit({ action: 'auth.login.blocked', actorId: user.id, entityId: user.id,
                         detail: { reason: 'DEACTIVATED' } });
      return { status: 'DEACTIVATED' };
    case 'ACTIVE':
      break;
  }

  const resolved = resolveRoles(user.grants, req.cycleId, req.now);
  const roles = resolved.map((r) => r.role);

  if (roles.length === 0) {
    await deps.audit({ action: 'auth.login.blocked', actorId: user.id, entityId: user.id,
                       detail: { reason: 'NO_ACTIVE_ROLES', cycleId: req.cycleId } });
    return { status: 'NO_ACTIVE_ROLES' };
  }

  if (requiresMfa(roles)) {
    if (!user.totpConfirmed) {
      await deps.audit({ action: 'auth.mfa.enrolment_required', actorId: user.id, entityId: user.id,
                         detail: { roles } });
      return { status: 'MFA_ENROLMENT_REQUIRED', userId: user.id };
    }
    if (req.mfaVerified !== true) {
      await deps.audit({ action: 'auth.mfa.challenged', actorId: user.id, entityId: user.id,
                         detail: { roles } });
      return { status: 'MFA_REQUIRED', userId: user.id, roles };
    }
  }

  await deps.recordSuccess(user.id, iso);
  const permissions = permissionsFor(roles);
  await deps.audit({ action: 'auth.login.succeeded', actorId: user.id, entityId: user.id,
                     detail: { cycleId: req.cycleId, roles, permissionCount: permissions.length,
                               mfa: requiresMfa(roles) } });

  return {
    status: 'OK',
    principal: {
      userId: user.id, roles, resolvedRoles: resolved, permissions,
      cycleId: req.cycleId, mfaSatisfied: requiresMfa(roles) ? true : false,
    },
  };
}
