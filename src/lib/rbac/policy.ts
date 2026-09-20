/**
 * Deny-by-default RBAC with explicit separation of duty.
 *
 * Separation of duty matters here specifically because departmental staff
 * legitimately hold several roles at once — the same lecturer supervises,
 * assesses and moderates. Role checks alone would let someone moderate their
 * own mark. These predicates are the second gate.
 */

export type RoleCode =
  | 'STUDENT' | 'SUPERVISOR' | 'ASSESSOR' | 'MODERATOR'
  | 'COORDINATOR' | 'EXTERNAL_EXAMINER' | 'ADMINISTRATOR';

export type Action =
  | 'topic.publish' | 'topic.allocate'
  | 'consultation.book' | 'consultation.grade' | 'consultation.attest'
  | 'presentation.nominate' | 'presentation.schedule' | 'presentation.grade'
  | 'presentation.moderate' | 'presentation.unlockSheet'
  | 'documentation.mark' | 'documentation.moderate'
  | 'mark.compute' | 'mark.publish' | 'mark.correct'
  | 'audit.read' | 'config.edit' | 'user.approve';

/**
 * The single source of truth for which roles may attempt which action.
 * `src/lib/auth/roles.ts` inverts this to derive a role's permissions, so the
 * two can never drift apart.
 */
export const ACTION_ROLES: Record<Action, readonly RoleCode[]> = {
  'topic.publish': ['SUPERVISOR', 'COORDINATOR'],
  'topic.allocate': ['COORDINATOR'],
  'consultation.book': ['STUDENT', 'SUPERVISOR'],
  'consultation.grade': ['SUPERVISOR'],
  'consultation.attest': ['STUDENT', 'SUPERVISOR'],
  'presentation.nominate': ['SUPERVISOR'],
  'presentation.schedule': ['COORDINATOR'],
  'presentation.grade': ['ASSESSOR', 'SUPERVISOR', 'COORDINATOR'],
  'presentation.moderate': ['MODERATOR', 'COORDINATOR'],
  'presentation.unlockSheet': ['COORDINATOR'],
  'documentation.mark': ['SUPERVISOR'],
  'documentation.moderate': ['MODERATOR', 'COORDINATOR'],
  'mark.compute': ['COORDINATOR'],
  'mark.publish': ['COORDINATOR'],
  'mark.correct': ['COORDINATOR'],
  'audit.read': ['ADMINISTRATOR', 'COORDINATOR', 'EXTERNAL_EXAMINER'],
  'config.edit': ['ADMINISTRATOR', 'COORDINATOR'],
  'user.approve': ['ADMINISTRATOR', 'COORDINATOR'],
};

export interface Principal {
  readonly userId: string;
  readonly roles: readonly RoleCode[];
}

export interface ResourceContext {
  /** Supervisor of record for the student the action touches. */
  readonly supervisorId?: string;
  /** Students this assessor is scheduled to grade. */
  readonly assignedMemberIds?: readonly string[];
  readonly memberId?: string;
  /** Who produced the mark now being moderated, unlocked or published. */
  readonly originatingMarkerId?: string;
  readonly published?: boolean;
}

export type Decision =
  | { readonly allow: true }
  | { readonly allow: false; readonly reason: string };

const DENY = (reason: string): Decision => ({ allow: false, reason });
const ALLOW: Decision = { allow: true };

export function can(p: Principal, action: Action, ctx: ResourceContext = {}): Decision {
  const permitted = ACTION_ROLES[action];
  if (!permitted.some((r) => p.roles.includes(r))) {
    return DENY(`Role not permitted for ${action}.`);
  }

  // Supervision scoping: a supervisor acts only on their own supervisees.
  if (
    (action === 'consultation.grade' || action === 'presentation.nominate' || action === 'documentation.mark') &&
    !p.roles.includes('COORDINATOR')
  ) {
    if (ctx.supervisorId !== p.userId) {
      return DENY('Not the supervisor of record for this student.');
    }
  }

  // Assessors grade only the students on their published session list.
  if (action === 'presentation.grade' && !p.roles.includes('COORDINATOR')) {
    if (!ctx.memberId || !(ctx.assignedMemberIds ?? []).includes(ctx.memberId)) {
      return DENY('Student is not on this assessor’s scheduled session list.');
    }
  }

  // Separation of duty: never review or release your own work.
  if (
    (action === 'presentation.moderate' ||
      action === 'documentation.moderate' ||
      action === 'presentation.unlockSheet') &&
    ctx.originatingMarkerId === p.userId
  ) {
    return DENY('Separation of duty: you may not moderate or unlock your own mark.');
  }
  if (action === 'mark.publish' && ctx.originatingMarkerId === p.userId) {
    return DENY('Separation of duty: the person who awarded a mark may not publish it.');
  }

  // Published marks are immutable — corrections supersede, never overwrite.
  if (action === 'mark.correct' && ctx.published !== true) {
    return DENY('Only a published mark is corrected by supersession.');
  }

  return ALLOW;
}

export function assertCan(p: Principal, action: Action, ctx: ResourceContext = {}): void {
  const d = can(p, action, ctx);
  if (!d.allow) throw new Error(`Forbidden: ${d.reason}`);
}
