import { createHash } from 'node:crypto';

/**
 * Append-only, hash-chained audit log.
 *
 * Each entry binds the hash of its predecessor, so any retrospective edit or
 * deletion breaks the chain and is detectable. "Logged" is not the same as
 * "demonstrably unaltered" — assessment evidence needs the second one.
 */

export const GENESIS_HASH = '0'.repeat(64);

export interface AuditInput {
  readonly sequence: bigint;
  readonly occurredAt: string;
  readonly actorId: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly before: unknown;
  readonly after: unknown;
}

/** Canonical JSON: keys sorted recursively, so hashing is order-independent. */
export function canonicalise(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalise(v)}`);
  return `{${entries.join(',')}}`;
}

/**
 * Hash an explicit field set, never a spread of the caller's object. A
 * ChainedEntry carries previousHash and entryHash; spreading it back in would
 * make verification hash a different payload than creation did, and the chain
 * would never validate.
 */
export function entryHash(input: AuditInput, previousHash: string): string {
  const payload = {
    sequence: input.sequence.toString(),
    occurredAt: input.occurredAt,
    actorId: input.actorId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    before: input.before,
    after: input.after,
  };
  return createHash('sha256')
    .update(previousHash)
    .update('\u0000')
    .update(canonicalise(payload))
    .digest('hex');
}

export interface ChainedEntry extends AuditInput {
  readonly previousHash: string;
  readonly entryHash: string;
}

export function chain(input: AuditInput, previousHash: string): ChainedEntry {
  return { ...input, previousHash, entryHash: entryHash(input, previousHash) };
}

export interface VerificationResult {
  readonly valid: boolean;
  readonly brokenAtSequence: bigint | null;
  readonly checked: number;
}

export function verifyChain(entries: readonly ChainedEntry[]): VerificationResult {
  let previous = GENESIS_HASH;
  for (const e of entries) {
    if (e.previousHash !== previous) {
      return { valid: false, brokenAtSequence: e.sequence, checked: entries.length };
    }
    if (entryHash(e, previous) !== e.entryHash) {
      return { valid: false, brokenAtSequence: e.sequence, checked: entries.length };
    }
    previous = e.entryHash;
  }
  return { valid: true, brokenAtSequence: null, checked: entries.length };
}
