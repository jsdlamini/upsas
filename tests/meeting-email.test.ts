import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderNoticeEmail } from '../src/lib/meetings/email';
import { makeNotice } from '../src/lib/meetings/notices';
import { sendEmail } from '../src/lib/notifications';
import {
  slotsOf, bookSlot, confirmBooking, projectOf, setContactEmail, emailOf,
  registerStudent, findPersonByUsername,
} from '../src/lib/data/store';

const NOW = new Date('2026-09-21T08:00:00Z');

/** Capture what would have gone to Resend instead of sending it. */
function captureResend() {
  const sent: Array<Record<string, unknown>> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: { body?: unknown }) => {
    if (String(url).includes('api.resend.com')) {
      sent.push(JSON.parse(String(init?.body)));
      return new Response('{"id":"test"}', { status: 200 });
    }
    return original(url as string, init as RequestInit);
  }) as typeof fetch;
  return { sent, restore: () => { globalThis.fetch = original; } };
}

function withEnv(values: Record<string, string | undefined>, run: () => Promise<void>) {
  const before: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(values)) {
    before[k] = process.env[k];
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  return run().finally(() => {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

/* ═════════════════════════════════════════════════════════ the message */

test('an email says what happened, and its button goes to the exact event', () => {
  const notice = makeNotice({
    forUserId: 'u-mahlalela', meetingRef: 'slot-9', kind: 'BOOKED', actionRequired: true,
    title: 'Sipho Dlamini booked Tue 22 Sep, 14:00', body: 'Chapter 3 draft · CS-204.',
    startsAt: '2026-09-22T12:00:00Z', href: '/book?focus=slot-9#slot-slot-9',
  }, NOW);
  const url = 'https://upsas.example/api/notifications/mn-1/open';
  const mail = renderNoticeEmail(notice, 'Dr Johnson Mahlalela', url);

  assert.equal(mail.subject, 'Sipho Dlamini booked Tue 22 Sep, 14:00 — action needed');
  assert.match(mail.text, /Hello Dr Mahlalela,/, 'a title is kept with the surname');
  assert.match(mail.text, /Confirm or decline: https:\/\/upsas\.example\/api\/notifications\/mn-1\/open/);
  assert.match(mail.html, /href="https:\/\/upsas\.example\/api\/notifications\/mn-1\/open"/);
  assert.match(mail.html, /#FFB81C/, 'the same yellow as the banner');
});

test('names and details are escaped, never injected into the HTML', () => {
  const notice = makeNotice({
    forUserId: 'u-s1', meetingRef: 'slot-1', kind: 'CONFIRMED', actionRequired: false,
    title: 'Confirmed', body: 'Agenda: <script>alert(1)</script>', startsAt: null,
  }, NOW);
  const mail = renderNoticeEmail(notice, 'Sipho A. Dlamini', 'https://x/open');
  assert.equal(mail.html.includes('<script>'), false);
  assert.ok(mail.html.includes('&lt;script&gt;'));
});

/* ═══════════════════════════════════════════════════════════ transport */

test('with a test redirect set, every email goes to one inbox, labelled with its real recipient', async () => {
  const cap = captureResend();
  try {
    await withEnv({ RESEND_API_KEY: 're_test', EMAIL_REDIRECT_TO: 'me@example.org' }, async () => {
      const outcome = await sendEmail({ to: 'student@example.org', subject: 'Confirmed', body: 'x', html: '<p>x</p>' });
      assert.equal(outcome, 'sent');
    });
  } finally { cap.restore(); }
  assert.deepEqual(cap.sent[0]?.['to'], ['me@example.org']);
  assert.equal(cap.sent[0]?.['subject'], '[for student@example.org] Confirmed');
  assert.equal(cap.sent[0]?.['html'], '<p>x</p>');
});

test('without a Resend key nothing leaves the server', async () => {
  const cap = captureResend();
  try {
    await withEnv({ RESEND_API_KEY: undefined }, async () => {
      assert.equal(await sendEmail({ to: 'a@b.org', subject: 's', body: 'b' }), 'stubbed');
    });
  } finally { cap.restore(); }
  assert.equal(cap.sent.length, 0);
});

/* ═══════════════════════════════════════════════ both parties, end to end */

test('booking and confirming email both people, each replying to the other', async () => {
  const studentId = 's4';
  const supervisorId = projectOf(studentId)!.supervisorId;
  assert.ok(setContactEmail(supervisorId, 'Supervisor@Example.org').ok);
  assert.ok(setContactEmail(`u-${studentId}`, 'lindiwe@example.org').ok);
  assert.equal(emailOf(supervisorId), 'supervisor@example.org', 'stored lower-cased');

  const cap = captureResend();
  try {
    await withEnv({ RESEND_API_KEY: 're_test', EMAIL_REDIRECT_TO: undefined, APP_URL: 'https://upsas.example/' }, async () => {
      const early = new Date('2026-01-01T00:00:00Z');
      const slot = slotsOf(supervisorId).find((s) => s.bookedByStudentId === null)!;
      assert.ok(bookSlot(slot.id, studentId, 'Maize dataset', early).ok);
      await settle();
      assert.ok(confirmBooking(slot.id, supervisorId).ok);
      await settle();
    });
  } finally { cap.restore(); }

  const toSupervisor = cap.sent.filter((m) => (m['to'] as string[])[0] === 'supervisor@example.org');
  const toStudent = cap.sent.filter((m) => (m['to'] as string[])[0] === 'lindiwe@example.org');
  assert.equal(toSupervisor.length, 2, 'told of the booking, then of the confirmation');
  assert.equal(toStudent.length, 2);

  assert.match(String(toSupervisor[0]?.['subject']), /booked .* — action needed$/);
  assert.match(String(toStudent[1]?.['subject']), /^Confirmed:/);
  assert.equal(toSupervisor[0]?.['reply_to'], 'lindiwe@example.org', "a reply reaches the student");
  assert.equal(toStudent[0]?.['reply_to'], 'supervisor@example.org');
  assert.match(String(toStudent[1]?.['text']), /https:\/\/upsas\.example\/api\/notifications\/.+\/open/,
               'links use APP_URL without a doubled slash');
});

test('someone with no address on file is skipped rather than failing the booking', async () => {
  const studentId = 's3';
  const supervisorId = projectOf(studentId)!.supervisorId;
  setContactEmail(supervisorId, '');
  setContactEmail(`u-${studentId}`, '');
  const cap = captureResend();
  try {
    await withEnv({ RESEND_API_KEY: 're_test' }, async () => {
      const slot = slotsOf(supervisorId).find((s) => s.bookedByStudentId === null)!;
      assert.ok(bookSlot(slot.id, studentId, 'Constraints', new Date('2026-01-01T00:00:00Z')).ok);
      await settle();
    });
  } finally { cap.restore(); }
  assert.equal(cap.sent.length, 0);
});

test('a bad address is refused, and a blank one clears it', () => {
  assert.equal(setContactEmail('u-s1', 'not-an-address').ok, false);
  assert.ok(setContactEmail('u-s1', 'sipho@example.org').ok);
  assert.ok(setContactEmail('u-s1', '').ok);
  assert.equal(emailOf('u-s1'), null);
});

test('a student who registers with an email keeps it', async () => {
  const result = await registerStudent({
    studentNumber: '202600777', surname: 'Nxumalo', otherNames: 'Zanele',
    programme: 'BSc IT', courseCode: 'CSC499', email: 'Zanele@Example.org',
    password: 'a long enough passphrase for the policy 2026',
  });
  assert.ok(result.ok, result.ok ? '' : result.error);
  const person = findPersonByUsername('202600777')!;
  assert.equal(emailOf(person.id), 'zanele@example.org',
               'previously validated and then thrown away');
});
