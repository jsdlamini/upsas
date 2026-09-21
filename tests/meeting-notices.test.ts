import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeNotice, isVisible, visibleFor, supersede, dismiss, dismissAll, toneOf,
  type MeetingNotice,
} from '../src/lib/meetings/notices';
import {
  slotsOf, bookSlot, confirmBooking, declineBooking, cancelBooking,
  noticesFor, dismissNotice, projectOf,
} from '../src/lib/data/store';

const NOW = new Date('2026-09-21T08:00:00Z');
const TOMORROW = '2026-09-22T12:00:00.000Z';

function notice(over: Partial<MeetingNotice> = {}): MeetingNotice {
  return {
    ...makeNotice({
      forUserId: 'u-s1', meetingRef: 'slot-1', kind: 'CONFIRMED',
      title: 'Confirmed', body: '', startsAt: TOMORROW, actionRequired: false,
    }, NOW),
    ...over,
  };
}

/* ═══════════════════════════════════════════════════════════ pure rules */

test('each outcome has its own bright tone, and bad news is not quieter', () => {
  assert.equal(toneOf('CONFIRMED'), 'confirmed');
  assert.equal(toneOf('BOOKED'), 'pending');
  assert.equal(toneOf('REQUESTED'), 'pending');
  assert.equal(toneOf('DECLINED'), 'cancelled');
  assert.equal(toneOf('CANCELLED'), 'cancelled');
});

test('a notice is only ever shown to the person it is addressed to', () => {
  const n = notice();
  assert.equal(isVisible(n, 'u-s1', NOW), true);
  assert.equal(isVisible(n, 'u-mahlalela', NOW), false);
});

test('a confirmation disappears once the meeting has started', () => {
  const n = notice();
  assert.equal(isVisible(n, 'u-s1', new Date('2026-09-22T11:59:00Z')), true);
  assert.equal(isVisible(n, 'u-s1', new Date('2026-09-22T12:01:00Z')), false);
});

test('a cancellation stays visible for a week even after the meeting time', () => {
  const n = notice({ kind: 'CANCELLED' });
  assert.equal(isVisible(n, 'u-s1', new Date('2026-09-23T09:00:00Z')), true,
               'someone who missed it still needs to find out');
  assert.equal(isVisible(n, 'u-s1', new Date('2026-09-29T09:00:00Z')), false);
});

test('a later event retires the earlier one, so "confirmed" cannot outlive a cancellation', () => {
  const list = [notice(), notice({ forUserId: 'u-mahlalela' })];
  assert.equal(supersede(list, 'slot-1', NOW), 2);
  assert.equal(visibleFor(list, 'u-s1', NOW).length, 0);
});

test('only the addressee can dismiss a notice', () => {
  const list = [notice()];
  assert.equal(dismiss(list, list[0]!.id, 'u-mahlalela', NOW), false);
  assert.equal(dismiss(list, list[0]!.id, 'u-s1', NOW), true);
  assert.equal(visibleFor(list, 'u-s1', NOW).length, 0);
});

test('something needing action is listed ahead of something informational', () => {
  const list = [
    notice({ id: 'info', createdAt: '2026-09-21T07:59:00Z' }),
    notice({ id: 'act', kind: 'BOOKED', actionRequired: true, createdAt: '2026-09-21T07:00:00Z' }),
  ];
  assert.deepEqual(visibleFor(list, 'u-s1', NOW).map((n) => n.id), ['act', 'info']);
});

test('dismiss all clears only what is currently visible to that person', () => {
  const list = [notice(), notice(), notice({ forUserId: 'u-mahlalela' })];
  assert.equal(dismissAll(list, 'u-s1', NOW), 2);
  assert.equal(visibleFor(list, 'u-mahlalela', NOW).length, 1);
});

/* ═════════════════════════════════════════ both parties, through the store */

test('booking, confirming and cancelling each tell both people', () => {
  // A student with a supervisor, and one of that supervisor's future slots.
  const studentId = 's4';
  const supervisorId = projectOf(studentId)!.supervisorId;
  const studentUser = 'u-s4';
  const early = new Date('2026-01-01T00:00:00Z');
  const slot = slotsOf(supervisorId).find((s) => s.bookedByStudentId === null)!;
  assert.ok(slot, 'seed provides an open slot');

  const booked = bookSlot(slot.id, studentId, 'Chapter 3 draft', early);
  assert.ok(booked.ok);

  const supervisorSees = noticesFor(supervisorId, early).filter((n) => n.meetingRef === slot.id);
  const studentSees = noticesFor(studentUser, early).filter((n) => n.meetingRef === slot.id);
  assert.equal(supervisorSees[0]?.kind, 'BOOKED');
  assert.equal(supervisorSees[0]?.actionRequired, true, 'the supervisor has to act');
  assert.equal(studentSees[0]?.kind, 'REQUESTED');

  assert.ok(confirmBooking(slot.id, supervisorId).ok);
  assert.deepEqual(
    noticesFor(studentUser, early).filter((n) => n.meetingRef === slot.id).map((n) => n.kind),
    ['CONFIRMED'], 'the pending notice is replaced, not stacked',
  );
  assert.deepEqual(
    noticesFor(supervisorId, early).filter((n) => n.meetingRef === slot.id).map((n) => n.kind),
    ['CONFIRMED'],
  );

  assert.ok(cancelBooking(slot.id, studentId, early).ok);
  assert.deepEqual(
    noticesFor(supervisorId, early).filter((n) => n.meetingRef === slot.id).map((n) => n.kind),
    ['CANCELLED'], 'no confirmation left standing after a cancellation',
  );
  assert.equal(slot.status, undefined, 'a reopened slot no longer carries the old state');
  assert.equal(slot.meetingLink, null);

  const mine = noticesFor(studentUser, early).find((n) => n.meetingRef === slot.id)!;
  assert.equal(dismissNotice(mine.id, supervisorId), false, 'not theirs to dismiss');
  assert.equal(dismissNotice(mine.id, studentUser), true);
});

test('a declined booking tells the student to book again', () => {
  const studentId = 's3';
  const supervisorId = projectOf(studentId)!.supervisorId;
  const early = new Date('2026-01-01T00:00:00Z');
  const slot = slotsOf(supervisorId).find((s) => s.bookedByStudentId === null)!;
  assert.ok(bookSlot(slot.id, studentId, 'Timetable constraints', early).ok);
  assert.ok(declineBooking(slot.id, supervisorId).ok);

  const told = noticesFor('u-s3', early).find((n) => n.meetingRef === slot.id);
  assert.equal(told?.kind, 'DECLINED');
  assert.equal(told?.actionRequired, true);
});

/* ═══════════════════════════════════════ the bell: links, opening, history */

import { recentlySeen, hrefOf } from '../src/lib/meetings/notices';
import { openNotice, recentNoticesFor, requestMeeting } from '../src/lib/data/store';

test('each party is linked to the row where they can act on the event', () => {
  const studentId = 's5';
  const supervisorId = projectOf(studentId)!.supervisorId;
  const early = new Date('2026-01-01T00:00:00Z');
  const slot = slotsOf(supervisorId).find((s) => s.bookedByStudentId === null)!;
  assert.ok(bookSlot(slot.id, studentId, 'Results chapter', early).ok);

  const forSupervisor = noticesFor(supervisorId, early).find((n) => n.meetingRef === slot.id)!;
  const forStudent = noticesFor('u-s5', early).find((n) => n.meetingRef === slot.id)!;
  assert.equal(hrefOf(forSupervisor), `/book?focus=${slot.id}#slot-${slot.id}`,
               'the supervisor lands on the row with Confirm and Decline');
  assert.equal(hrefOf(forStudent), `/book?focus=${slot.id}#booking-${slot.id}`);

  assert.ok(declineBooking(slot.id, supervisorId).ok);
  const declined = noticesFor('u-s5', early).find((n) => n.meetingRef === slot.id)!;
  assert.equal(hrefOf(declined), '/book#open-slots', 'a declined student is sent to pick another slot');
});

test('opening a notice marks it read, moves it to Earlier, and returns its link', () => {
  const studentId = 's6';
  const supervisorId = projectOf(studentId)!.supervisorId;
  const early = new Date('2026-01-01T00:00:00Z');
  const slot = slotsOf(supervisorId).find((s) => s.bookedByStudentId === null)!;
  assert.ok(bookSlot(slot.id, studentId, 'Evaluation plan', early).ok);

  const notice = noticesFor(supervisorId, early).find((n) => n.meetingRef === slot.id)!;
  assert.equal(openNotice(notice.id, 'u-s6'), null, "somebody else's notice is treated as unknown");
  assert.equal(openNotice(notice.id, supervisorId), `/book?focus=${slot.id}#slot-${slot.id}`);
  assert.equal(noticesFor(supervisorId, early).some((n) => n.id === notice.id), false,
               'no longer counted on the bell');
  assert.ok(recentNoticesFor(supervisorId).some((n) => n.id === notice.id),
            'but still listed under Earlier');
});

test('Earlier leaves out superseded notices and anything older than a week', () => {
  const fresh = notice({ seenAt: NOW.toISOString() });
  const stale = notice({ seenAt: NOW.toISOString(), createdAt: '2026-09-01T00:00:00Z' });
  const replaced = notice({ seenAt: NOW.toISOString(), supersededAt: NOW.toISOString() });
  assert.deepEqual(recentlySeen([fresh, stale, replaced], 'u-s1', NOW).map((n) => n.id), [fresh.id]);
});

test('a meeting request rings the supervisor bell with a link to approve it', () => {
  const studentId = 's2';
  const supervisorId = projectOf(studentId)!.supervisorId;
  assert.ok(requestMeeting({
    studentId, supervisorId, agenda: 'Corpus licensing question', preferredTimes: 'Friday morning',
  }).ok);
  const rung = noticesFor(supervisorId).find((n) => n.title.includes('asked for a meeting'));
  assert.ok(rung);
  assert.equal(rung?.actionRequired, true);
  assert.match(hrefOf(rung!), /^\/book\?focus=mr-.*#request-mr-/);
});
