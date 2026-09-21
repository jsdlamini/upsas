import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * Account recovery, without an external identity provider.
 *
 * Authentication here is local by policy, so there is nothing to defer a
 * forgotten password to. The alternative that departments fall into is the
 * coordinator typing a new password and reading it down the phone, which means
 * the coordinator knows a password that is then used to sign as that person.
 *
 * This is the smallest design that avoids that:
 *
 *   A coordinator issues a code. They never learn the password.
 *   The code is short enough to read aloud and is shown exactly once.
 *   Only its hash is stored, so a copy of the database is not a set of keys.
 *   It expires in thirty minutes and works once.
 *   Redeeming it sets a password the user chooses, clears the lockout, and
 *   ends every session that account already has — because a forgotten password
 *   and a stolen one look identical from here.
 *
 * Issuing is an in-person or known-voice act. That is a procedure, not code,
 * and it is the part the department has to get right.
 */

export interface ResetTicket {
  id: string;
  userId: string;
  /** SHA-256 of the code. The code itself is never stored. */
  codeHash: string;
  issuedBy: string;
  issuedAt: string;
  expiresAt: string;
  usedAt: string | null;
  /** Cancelled by a coordinator, or superseded by a newer code. */
  revokedAt: string | null;
}

export const RECOVERY_POLICY = {
  /** Long enough to resist guessing at one attempt per ticket, short enough
   *  to read over a bad line: 9 characters from a 31-letter alphabet. */
  codeGroups: 3,
  groupLength: 3,
  validMinutes: 30,
} as const;

/** No 0/O/1/I/L: these codes get read aloud and written down. */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function generateCode(random: (max: number) => number = (max) => randomInt(max)): string {
  const groups: string[] = [];
  for (let g = 0; g < RECOVERY_POLICY.codeGroups; g += 1) {
    let group = '';
    for (let i = 0; i < RECOVERY_POLICY.groupLength; i += 1) {
      group += ALPHABET[random(ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join('-');
}

/** Case and separators are noise once a human has retyped it. */
export function normaliseCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function hashCode(code: string): string {
  return createHash('sha256').update(normaliseCode(code)).digest('hex');
}

function hashesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function issueTicket(
  userId: string, issuedBy: string, now: Date,
  code: string = generateCode(),
): { ticket: ResetTicket; code: string } {
  const issuedAt = now.toISOString();
  return {
    code,
    ticket: {
      id: `rst-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      userId,
      codeHash: hashCode(code),
      issuedBy,
      issuedAt,
      expiresAt: new Date(now.getTime() + RECOVERY_POLICY.validMinutes * 60_000).toISOString(),
      usedAt: null,
      revokedAt: null,
    },
  };
}

export type RedeemResult =
  | { ok: true; ticket: ResetTicket }
  | { ok: false; reason: string };

/**
 * Every failure returns the same sentence. A message distinguishing "no such
 * code" from "expired" tells someone working through codes which guesses were
 * close, and there is nothing a legitimate user does with the difference that
 * asking the coordinator again does not also solve.
 */
const REFUSAL = 'That code is not valid. Ask the coordinator to issue another one.';

export function redeem(
  tickets: readonly ResetTicket[], username: string, userId: string | null,
  code: string, now: Date,
): RedeemResult {
  void username;
  if (!userId) return { ok: false, reason: REFUSAL };

  const candidateHash = hashCode(code);
  const iso = now.toISOString();

  const match = tickets.find(
    (t) => t.userId === userId
      && t.usedAt === null
      && t.revokedAt === null
      && t.expiresAt > iso
      && hashesEqual(t.codeHash, candidateHash),
  );

  if (!match) return { ok: false, reason: REFUSAL };
  return { ok: true, ticket: match };
}

/** Issuing a new code kills any earlier one, so only the latest ever works. */
export function revokeOutstanding(
  tickets: ResetTicket[], userId: string, now: Date,
): number {
  let revoked = 0;
  for (const ticket of tickets) {
    if (ticket.userId !== userId || ticket.usedAt || ticket.revokedAt) continue;
    ticket.revokedAt = now.toISOString();
    revoked += 1;
  }
  return revoked;
}

export function isSpent(ticket: ResetTicket, now: Date): boolean {
  return Boolean(ticket.usedAt) || Boolean(ticket.revokedAt) || ticket.expiresAt <= now.toISOString();
}
