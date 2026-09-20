import test from 'node:test';
import assert from 'node:assert/strict';

import {
  registerStudent, requestStaffAccount, approveStaffAccount, declineStaffAccount,
  findStudentByNumber, findPersonByUsername, passwordHashFor, demoPasswordHash,
  requestMeeting, decideMeetingRequest, meetingRequestsFor,
  STUDENT_NUMBER_PATTERN, pendingStaffRequests,
} from '../src/lib/data/store';

test('student number pattern matches the observed nine-digit form', () => {
  assert.ok(STUDENT_NUMBER_PATTERN.test('202500123'));
  assert.ok(STUDENT_NUMBER_PATTERN.test('209900101'));
  assert.ok(!STUDENT_NUMBER_PATTERN.test('20250'));
  assert.ok(!STUDENT_NUMBER_PATTERN.test('ABC123456'));
});

test('registerStudent creates a self-service account', async () => {
  const r = await registerStudent({
    studentNumber: '202500991', surname: 'Mamba', otherNames: 'Zanele',
    programme: 'BSc IT', courseCode: 'CSC 499', email: 'z@example.ac.sz',
    password: 'correct horse battery staple',
  });
  assert.ok(r.ok);
  const st = findStudentByNumber('202500991');
  assert.ok(st);
  assert.equal(st?.surname, 'Mamba');
  assert.equal(st?.projectId, 'unallocated');
  assert.ok(findPersonByUsername('202500991'));
});

test('registerStudent rejects a malformed student number', async () => {
  const r = await registerStudent({
    studentNumber: '991', surname: 'Mamba', otherNames: 'Zanele',
    programme: 'BSc IT', courseCode: 'CSC 499', email: '', password: 'correct horse battery staple',
  });
  assert.equal(r.ok, false);
});

test('registerStudent rejects a weak password', async () => {
  const r = await registerStudent({
    studentNumber: '202500992', surname: 'Mamba', otherNames: 'Zanele',
    programme: 'BSc IT', courseCode: 'CSC 499', email: '', password: 'short',
  });
  assert.equal(r.ok, false);
});

test('registerStudent rejects a duplicate number', async () => {
  const first = await registerStudent({
    studentNumber: '202500993', surname: 'Mamba', otherNames: 'Zanele',
    programme: 'BSc IT', courseCode: 'CSC 499', email: '', password: 'correct horse battery staple',
  });
  assert.ok(first.ok);
  const dup = await registerStudent({
    studentNumber: '202500993', surname: 'Mamba', otherNames: 'Zanele',
    programme: 'BSc IT', courseCode: 'CSC 499', email: '', password: 'correct horse battery staple',
  });
  assert.equal(dup.ok, false);
});

test('a registered account gets its own password hash, not the demo hash', async () => {
  await registerStudent({
    studentNumber: '202500994', surname: 'Mamba', otherNames: 'Zanele',
    programme: 'BSc IT', courseCode: 'CSC 499', email: '', password: 'correct horse battery staple',
  });
  const own = await passwordHashFor('202500994');
  const demo = await demoPasswordHash();
  assert.notEqual(own, demo);
});

test('staff registration is held pending, then activated by a coordinator', () => {
  const r = requestStaffAccount({
    username: 'newsupervisor', fullName: 'Dr New Supervisor', email: 'n@example.ac.sz',
    requestedRoles: ['SUPERVISOR', 'ASSESSOR'], justification: 'Supervising CSC 400 students this cycle.',
  });
  assert.ok(r.ok);
  const pending = pendingStaffRequests();
  assert.ok(pending.some((p) => p.username === 'newsupervisor'));
  assert.equal(findPersonByUsername('newsupervisor')?.status, 'PENDING_APPROVAL');
  assert.equal(findPersonByUsername('newsupervisor')?.grants.length, 0);

  const id = pending.find((p) => p.username === 'newsupervisor')!.id;
  assert.ok(approveStaffAccount(id).ok);
  const approved = findPersonByUsername('newsupervisor');
  assert.equal(approved?.status, 'ACTIVE');
  assert.deepEqual(approved?.grants.map((g) => g.role).sort(), ['ASSESSOR', 'SUPERVISOR']);
});

test('staff registration rejects a taken username', () => {
  const r = requestStaffAccount({
    username: 'coordinator', fullName: 'Impostor', email: 'x@example.ac.sz',
    requestedRoles: ['SUPERVISOR'], justification: 'Just testing a duplicate.',
  });
  assert.equal(r.ok, false);
});

test('declining a staff request deactivates it', () => {
  requestStaffAccount({
    username: 'declineduser', fullName: 'Dr Declined', email: 'd@example.ac.sz',
    requestedRoles: ['ASSESSOR'], justification: 'For the decline test.',
  });
  const pending = pendingStaffRequests();
  const id = pending.find((p) => p.username === 'declineduser')!.id;
  assert.ok(declineStaffAccount(id).ok);
  assert.equal(findPersonByUsername('declineduser')?.status, 'DEACTIVATED');
});

test('a student can request a meeting and a supervisor can decide it', () => {
  const r = requestMeeting({
    studentId: 's1', supervisorId: 'u-mahlalela', agenda: 'Review methodology',
    preferredTimes: 'Tue 10:00–12:00',
  });
  assert.ok(r.ok);
  const mine = meetingRequestsFor('u-mahlalela').filter((m) => m.studentId === 's1');
  assert.ok(mine.length > 0);
  const id = mine.at(-1)!.id;
  assert.ok(decideMeetingRequest(id, 'APPROVED').ok);
  assert.equal(meetingRequestsFor('u-mahlalela').find((m) => m.id === id)?.status, 'APPROVED');
  assert.equal(decideMeetingRequest('does-not-exist', 'APPROVED').ok, false);
});

test('requestMeeting requires an agenda and a time', () => {
  assert.equal(requestMeeting({ studentId: 's1', supervisorId: 'u-mahlalela', agenda: '', preferredTimes: 'Tue' }).ok, false);
  assert.equal(requestMeeting({ studentId: 's1', supervisorId: 'u-mahlalela', agenda: 'Review', preferredTimes: '' }).ok, false);
});
