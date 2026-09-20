import { cookies } from 'next/headers';
import { issueSession, checkSession, principalFromSession, type SessionRecord } from './session';
import type { AuthenticatedPrincipal } from './login';
import { CYCLE, findPerson } from '../data/store';

/**
 * Process-local session table, replaced by the AuthSession model under Prisma.
 *
 * Pinned to globalThis because Next's dev server re-evaluates server modules on
 * hot reload, which would otherwise give each compiled route its own empty Map
 * and silently sign the user out on navigation. Same reason the Prisma client
 * is conventionally pinned.
 */
const globalForSessions = globalThis as unknown as { __upsasSessions?: Map<string, SessionRecord> };
const SESSIONS: Map<string, SessionRecord> = (globalForSessions.__upsasSessions ??= new Map());
export const COOKIE = 'upsas_session';

export function createSession(userId: string, mfaSatisfied: boolean) {
  const issued = issueSession(userId, new Date(), mfaSatisfied);
  SESSIONS.set(issued.record.id, issued.record);
  return issued;
}

export function destroySession(id: string): void {
  SESSIONS.delete(id);
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

  const record = SESSIONS.get(id);
  if (!record) return null;

  const now = new Date();
  const check = checkSession(record, token, now);
  if (!check.valid) return null;

  SESSIONS.set(id, { ...record, lastSeenAt: now.toISOString() });

  const person = findPerson(record.userId);
  if (!person) return null;
  return principalFromSession(record, person.grants, CYCLE, now);
}
