import test from 'node:test';
import assert from 'node:assert/strict';

import { canonicalise, chain, verifyChain, GENESIS_HASH, type ChainedEntry } from '../src/lib/audit/hashchain';
import { can, type Principal } from '../src/lib/rbac/policy';
import { checkPassword } from '../src/lib/auth/password';

function build(n: number): ChainedEntry[] {
  const out: ChainedEntry[] = [];
  let prev = GENESIS_HASH;
  for (let i = 0; i < n; i++) {
    const e = chain({
      sequence: BigInt(i + 1),
      occurredAt: `2026-05-0${(i % 9) + 1}T08:00:00.000Z`,
      actorId: 'coord-1', action: 'mark.publish',
      entityType: 'MarkSnapshot', entityId: `snap-${i}`,
      before: null, after: { finalMark: 67.1 },
    }, prev);
    out.push(e);
    prev = e.entryHash;
  }
  return out;
}

test('canonical JSON is key-order independent', () => {
  assert.equal(canonicalise({ b: 1, a: { d: 2, c: 3 } }), canonicalise({ a: { c: 3, d: 2 }, b: 1 }));
});

test('an intact audit chain verifies', () => {
  const r = verifyChain(build(25));
  assert.equal(r.valid, true);
  assert.equal(r.checked, 25);
});

test('altering a historical entry breaks the chain at that point', () => {
  const entries = build(10);
  const tampered = [...entries];
  tampered[4] = { ...entries[4]!, after: { finalMark: 99.9 } };
  const r = verifyChain(tampered);
  assert.equal(r.valid, false);
  assert.equal(r.brokenAtSequence, 5n);
});

test('deleting an entry breaks the chain', () => {
  const entries = build(10);
  const r = verifyChain([...entries.slice(0, 4), ...entries.slice(5)]);
  assert.equal(r.valid, false);
});

const lecturer: Principal = { userId: 'u-1', roles: ['SUPERVISOR', 'ASSESSOR', 'MODERATOR'] };

test('a supervisor cannot grade a student they do not supervise', () => {
  const d = can(lecturer, 'consultation.grade', { supervisorId: 'u-2' });
  assert.equal(d.allow, false);
});

test('an assessor cannot grade a student outside their scheduled session', () => {
  const d = can(lecturer, 'presentation.grade', { memberId: 'm-9', assignedMemberIds: ['m-1', 'm-2'] });
  assert.equal(d.allow, false);
});

test('separation of duty: a lecturer cannot moderate their own mark', () => {
  const own = can(lecturer, 'presentation.moderate', { originatingMarkerId: 'u-1' });
  assert.equal(own.allow, false);
  const other = can(lecturer, 'presentation.moderate', { originatingMarkerId: 'u-7' });
  assert.equal(other.allow, true);
});

test('separation of duty: the marker may not publish their own mark', () => {
  const coord: Principal = { userId: 'u-3', roles: ['COORDINATOR'] };
  assert.equal(can(coord, 'mark.publish', { originatingMarkerId: 'u-3' }).allow, false);
  assert.equal(can(coord, 'mark.publish', { originatingMarkerId: 'u-9' }).allow, true);
});

test('a student holds none of the grading permissions', () => {
  const s: Principal = { userId: 'u-9', roles: ['STUDENT'] };
  for (const a of ['consultation.grade', 'presentation.grade', 'mark.publish', 'config.edit'] as const) {
    assert.equal(can(s, a).allow, false, `student should not be able to ${a}`);
  }
  assert.equal(can(s, 'consultation.attest').allow, true);
});

test('password policy follows SP 800-63B-4: length over composition', () => {
  assert.equal(checkPassword('correct horse battery staple').ok, true, 'a long passphrase is fine');
  assert.equal(checkPassword('P@ss1!').ok, false, 'short but "complex" is rejected on length');
  assert.equal(checkPassword('aaaaaaaaaaaa').ok, false, 'repeated single character rejected');
  assert.equal(checkPassword('uneswa-project-2026', ['uneswa']).ok, false, 'contextual term rejected');
  assert.equal(checkPassword('a whole sentence with spaces in it').ok, true, 'spaces permitted');
});

test('the inlined argon2id identifier still hashes and verifies', async () => {
  const { hashPassword, verifyPassword, ARGON2ID } = await import('../src/lib/auth/password.js');
  assert.equal(ARGON2ID, 2, 'Argon2id must be algorithm 2 — check @node-rs/argon2 if this fails');
  const h = await hashPassword('a long enough passphrase');
  assert.match(h, /^\$argon2id\$/, 'hash must be argon2id, not argon2i or argon2d');
  assert.equal(await verifyPassword(h, 'a long enough passphrase'), true);
  assert.equal(await verifyPassword(h, 'wrong'), false);
});
