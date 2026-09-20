import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import type { Algorithm } from '@node-rs/argon2';
import { readFileSync } from 'node:fs';

/**
 * Local password policy, conforming to NIST SP 800-63-4 / SP 800-63B-4
 * (final, July 2025) — which SUPERSEDES the 2017 guidance most codebases
 * still encode. Concretely:
 *   - minimum 8, 15 recommended; maximum accepted length at least 64
 *   - all printable Unicode permitted, including spaces and emoji
 *   - NO composition rules (no "must contain an uppercase and a symbol")
 *   - NO forced periodic rotation; rotate only on evidence of compromise
 *   - screen against a blocklist — held LOCALLY, never a breach-check API,
 *     because no external service may participate in verification here.
 */

export { ARGON2ID };

export const PASSWORD_POLICY = {
  minLength: 8,
  recommendedLength: 15,
  maxLength: 128,
  forbidComposition: true,
  rotationDays: null,
} as const;

/**
 * Algorithm.Argon2id is an ambient const enum upstream, which cannot be read
 * under isolatedModules — the setting Next requires. The value is inlined and
 * pinned by a test rather than imported.
 */
const ARGON2ID: Algorithm = 2 as Algorithm;

const ARGON2ID_PARAMS = {
  algorithm: ARGON2ID,
  memoryCost: 19456, // 19 MiB — OWASP ASVS 5.0 minimum configuration
  timeCost: 2,
  parallelism: 1,
} as const;

let blocklist: Set<string> | null = null;

/** Loaded from disk at boot. Ship and update the file with the deployment. */
export function loadBlocklist(path = process.env.PASSWORD_BLOCKLIST_PATH ?? './data/password-blocklist.txt'): Set<string> {
  if (blocklist) return blocklist;
  try {
    const raw = readFileSync(path, 'utf8');
    blocklist = new Set(raw.split('\n').map((l) => l.trim().toLowerCase()).filter(Boolean));
  } catch {
    blocklist = new Set();
  }
  return blocklist;
}

export interface PasswordCheck {
  readonly ok: boolean;
  readonly problems: readonly string[];
}

export function checkPassword(password: string, context: readonly string[] = []): PasswordCheck {
  const problems: string[] = [];
  const chars = [...password];

  if (chars.length < PASSWORD_POLICY.minLength) {
    problems.push(`Must be at least ${PASSWORD_POLICY.minLength} characters.`);
  }
  if (chars.length > PASSWORD_POLICY.maxLength) {
    problems.push(`Must be at most ${PASSWORD_POLICY.maxLength} characters.`);
  }
  const lower = password.toLowerCase();
  if (loadBlocklist().has(lower)) {
    problems.push('This password appears on the local blocklist of known-compromised passwords.');
  }
  for (const term of context) {
    if (term && term.length >= 4 && lower.includes(term.toLowerCase())) {
      problems.push('Must not contain your name, username or institution.');
      break;
    }
  }
  if (/^(.)\1+$/.test(password)) {
    problems.push('Must not be a single repeated character.');
  }

  return { ok: problems.length === 0, problems };
}

export async function hashPassword(password: string): Promise<string> {
  return argonHash(password, ARGON2ID_PARAMS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argonVerify(hash, password);
  } catch {
    return false;
  }
}

/** Lockout thresholds. Throttling is local; no external reputation service. */
export const LOCKOUT = { maxFailedAttempts: 10, lockoutMinutes: 15 } as const;
