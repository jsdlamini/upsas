import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isAssessable, appearsInCohort, mayCarryCredit, isCarried,
  validateChange, describe, defaultEnrolment, type Enrolment,
} from '../src/lib/enrolment/status';
import {
  effectiveDueAt, statusOf, validateDeadline, validateExtension, visibleReason,
  type Deadline, type Extension,
} from '../src/lib/deadlines/schedule';
import {
  generateCode, normaliseCode, hashCode, issueTicket, redeem,
  revokeOutstanding, isSpent, RECOVERY_POLICY,
} from '../src/lib/auth/recovery';
import { computeFinalMark } from '../src/lib/assessment/compute';
import { PROFILE_A } from '../src/lib/assessment/config';

/* ══════════════════════════════════════════════════════ enrolment status */

const CTX = { published: false, hasSignedMarks: false };

function enrolment(over: Partial<Enrolment> = {}): Enrolment {
  return { ...defaultEnrolment('s1', '2025-08-01'), ...over };
}

test('deferred and withdrawn students are not assessed or scheduled', () => {
  assert.equal(isAssessable('DEFERRED'), false);
  assert.equal(isAssessable('WITHDRAWN'), false);
  assert.equal(appearsInCohort('WITHDRAWN'), false);
  assert.equal(isAssessable('SUPPLEMENTARY'), true);
  assert.equal(isAssessable('CARRY_OVER'), true);
});

test('a status other than active has to be explained', () => {
  const errors = validateChange(enrolment(), {
    status: 'DEFERRED', effectiveFrom: '2026-03-02', note: 'ill', carried: [],
  }, CTX);
  assert.ok(errors.some((e) => e.includes('Say why')));
});

test('only supplementary and carry-over students may carry credit', () => {
  assert.equal(mayCarryCredit('ACTIVE'), false);
  const errors = validateChange(enrolment(), {
    status: 'ACTIVE', effectiveFrom: '2025-08-01', note: '',
    carried: [{ componentKey: 'P1', percentage: 68, fromCycleId: '2024/2025', ref: 'BoE 4.2' }],
  }, CTX);
  assert.ok(errors.some((e) => e.includes('cannot carry credit')));
});

test('carried credit must name a cycle and a board decision', () => {
  const errors = validateChange(enrolment(), {
    status: 'CARRY_OVER', effectiveFrom: '2025-08-01',
    note: 'Repeating the project after deferring documentation.',
    carried: [{ componentKey: 'P1', percentage: 68, fromCycleId: '', ref: '' }],
  }, CTX);
  assert.ok(errors.some((e) => e.includes('which cycle')));
  assert.ok(errors.some((e) => e.includes('board decision')));
});

test('a released result is corrected by supersession, not by a status change', () => {
  const errors = validateChange(enrolment(), {
    status: 'WITHDRAWN', effectiveFrom: '2026-05-01',
    note: 'Left the programme at the end of the second semester.', carried: [],
  }, { published: true, hasSignedMarks: true });
  assert.ok(errors.some((e) => e.includes('supersession')));
});

test('a carried component is recognised by key', () => {
  const record = enrolment({
    status: 'CARRY_OVER',
    carried: [{ componentKey: 'P1', percentage: 68, fromCycleId: '2024/2025', ref: 'BoE 4.2' }],
  });
  assert.equal(isCarried(record, 'P1'), true);
  assert.equal(isCarried(record, 'P2'), false);
  assert.match(describe(record), /carrying P1 at 68%/);
});

/* ═══════════════════════════════════════════ the engine and non-standard */

test('a deferred student produces a snapshot that says so, not a pile of pending flags', () => {
  const snapshot = computeFinalMark({
    studentId: 's1', cycleId: '2025/2026', consultations: [], presentations: [],
    computedBy: 'u-coord', enrolment: { status: 'DEFERRED' },
  }, PROFILE_A);

  assert.equal(snapshot.finalMark, null);
  assert.equal(snapshot.grade, null);
  assert.equal(snapshot.blocked, true);
  assert.deepEqual(snapshot.flags.map((f) => f.code), ['NOT_ASSESSED_THIS_CYCLE']);
  assert.equal(snapshot.components.length, 0);
});

test('carried credit stands in for a panel and records where it came from', () => {
  const snapshot = computeFinalMark({
    studentId: 's8', cycleId: '2025/2026', consultations: [], presentations: [],
    computedBy: 'u-coord',
    enrolment: {
      status: 'CARRY_OVER',
      carried: [{ componentKey: 'p1', percentage: 68, fromCycleId: '2024/2025', ref: 'BoE 4.2' }],
    },
  }, PROFILE_A);

  const p1 = snapshot.components.find((c) => c.key === 'p1');
  assert.equal(p1?.percentage, 68);
  assert.equal(p1?.detail['source'], 'CARRIED');
  assert.equal(p1?.detail['fromCycleId'], '2024/2025');

  const carriedFlag = snapshot.flags.find((f) => f.code === 'COMPONENT_CARRIED');
  assert.ok(carriedFlag);
  assert.equal(carriedFlag?.blocking, false, 'carried credit is not a problem to resolve');
  assert.ok(!snapshot.flags.some((f) => f.code === 'PRESENTATION_PENDING' && f.message.includes('1')),
            'nobody is chased to mark a component already passed');
});

/* ═════════════════════════════════════════════════════════════ deadlines */

const DEADLINE: Deadline = {
  id: 'dl-1', cycleId: '2025/2026', key: 'chapters-1-2',
  label: 'Chapters 1 and 2', dueAt: '2025-11-14T14:00:00.000Z',
  graceMinutes: 60, published: true, note: '',
};

function extension(over: Partial<Extension> = {}): Extension {
  return {
    id: 'ext-1', studentId: 's1', deadlineKey: 'chapters-1-2',
    newDueAt: '2025-11-21T14:00:00.000Z', kind: 'EXTENSION',
    reason: 'Bereavement, documented with the faculty office.',
    approvedBy: 'u-coord', approvedAt: '2025-11-10T08:00:00.000Z', ...over,
  };
}

test('an extension moves a deadline later and never earlier', () => {
  assert.equal(effectiveDueAt(DEADLINE, extension()), '2025-11-21T14:00:00.000Z');
  const earlier = extension({ newDueAt: '2025-11-01T14:00:00.000Z' });
  assert.equal(effectiveDueAt(DEADLINE, earlier), DEADLINE.dueAt, 'an earlier date is ignored, not applied');

  const errors = validateExtension(
    { studentId: 's1', deadlineKey: 'chapters-1-2', newDueAt: '2025-11-01T14:00:00.000Z',
      kind: 'EXTENSION', reason: 'Bereavement, documented.', approvedBy: 'u-coord' },
    DEADLINE,
  );
  assert.ok(errors.some((e) => e.includes('moves a deadline later')));
});

test('the grounds for an accommodation are not shown to a supervisor', () => {
  const record = extension({ kind: 'ACCOMMODATION' });
  assert.equal(visibleReason(record, false), null);
  assert.equal(visibleReason(record, true), record.reason);
});

test('grace absorbs the late-night submission without becoming a second deadline', () => {
  const inGrace = statusOf(DEADLINE, null, null, new Date('2025-11-14T14:30:00Z'));
  assert.equal(inGrace.state, 'GRACE');

  const missed = statusOf(DEADLINE, null, null, new Date('2025-11-14T15:30:00Z'));
  assert.equal(missed.state, 'MISSED');

  const onTime = statusOf(DEADLINE, null, '2025-11-14T14:45:00Z', new Date('2025-11-20T00:00:00Z'));
  assert.equal(onTime.state, 'SUBMITTED');

  const late = statusOf(DEADLINE, null, '2025-11-15T17:00:00Z', new Date('2025-11-20T00:00:00Z'));
  assert.equal(late.state, 'LATE');
  assert.equal(late.minutesLate, 1560);
});

test("a student with an extension is judged against their date, not the cohort's", () => {
  const status = statusOf(DEADLINE, extension(), null, new Date('2025-11-15T09:00:00Z'));
  assert.equal(status.state, 'OPEN');
  assert.equal(status.extended, true);

  const without = statusOf(DEADLINE, null, null, new Date('2025-11-15T09:00:00Z'));
  assert.equal(without.state, 'MISSED');
});

test('an unpublished deadline is a draft and shows students nothing', () => {
  const status = statusOf({ ...DEADLINE, published: false }, null, null, new Date('2025-11-15T09:00:00Z'));
  assert.equal(status.state, 'DRAFT');
});

test('a deadline needs a time, not a day', () => {
  const errors = validateDeadline({ ...DEADLINE, dueAt: 'Friday' });
  assert.ok(errors.some((e) => e.includes('not a deadline')));
});

/* ══════════════════════════════════════════════════════ account recovery */

const NOW = new Date('2026-09-20T10:00:00Z');

test('a code is readable aloud and free of ambiguous characters', () => {
  const code = generateCode();
  assert.match(code, /^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/);
  assert.equal(/[01OIL]/.test(code), false, 'nothing a person can mishear or mistype');
  assert.equal(normaliseCode('k4p-7hm-2qx'), 'K4P7HM2QX');
});

test('only the hash is stored, so a copy of the database is not a set of keys', () => {
  const { ticket, code } = issueTicket('u1', 'u-coord', NOW);
  assert.equal(ticket.codeHash, hashCode(code));
  assert.equal(JSON.stringify(ticket).includes(code.replace(/-/g, '')), false);
});

test('a code works once', () => {
  const { ticket, code } = issueTicket('u1', 'u-coord', NOW);
  const first = redeem([ticket], 'nomcebo', 'u1', code, NOW);
  assert.ok(first.ok);

  ticket.usedAt = NOW.toISOString();
  const second = redeem([ticket], 'nomcebo', 'u1', code, NOW);
  assert.equal(second.ok, false);
});

test('a code expires', () => {
  const { ticket, code } = issueTicket('u1', 'u-coord', NOW);
  const later = new Date(NOW.getTime() + (RECOVERY_POLICY.validMinutes + 1) * 60_000);
  assert.equal(redeem([ticket], 'nomcebo', 'u1', code, later).ok, false);
  assert.equal(isSpent(ticket, later), true);
});

test("one person's code cannot be redeemed against another's account", () => {
  const { ticket, code } = issueTicket('u1', 'u-coord', NOW);
  assert.equal(redeem([ticket], 'sipho', 'u2', code, NOW).ok, false);
});

test('every failure says the same thing, so no guess is confirmed as close', () => {
  const { ticket } = issueTicket('u1', 'u-coord', NOW);
  const wrongCode = redeem([ticket], 'nomcebo', 'u1', 'AAA-AAA-AAA', NOW);
  const unknownUser = redeem([ticket], 'ghost', null, 'AAA-AAA-AAA', NOW);
  assert.equal(wrongCode.ok, false);
  assert.equal(unknownUser.ok, false);
  assert.equal(
    (wrongCode as { reason: string }).reason,
    (unknownUser as { reason: string }).reason,
  );
});

test('issuing a new code cancels the old one', () => {
  const first = issueTicket('u1', 'u-coord', NOW);
  const tickets = [first.ticket];
  const revoked = revokeOutstanding(tickets, 'u1', NOW);
  assert.equal(revoked, 1);
  assert.equal(redeem(tickets, 'nomcebo', 'u1', first.code, NOW).ok, false);
});
