import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/lib/auth/current';
import { findPerson, findStudent, findStudentByNumber, bookingsOf, consultationsOf } from '@/lib/data/store';
import { buildIcal, type ICalEvent } from '@/lib/ical';

export const dynamic = 'force-dynamic';

/** A student's consultation calendar as an iCal (.ics) feed. */
export async function GET() {
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');

  const person = findPerson(principal.userId);
  const student = person?.studentId
    ? findStudent(person.studentId)
    : findStudentByNumber(person?.username ?? '');

  const events: ICalEvent[] = [];

  if (student) {
    // Upcoming bookings (open slots the student has claimed).
    for (const s of bookingsOf(student.id)) {
      const end = new Date(new Date(s.startsAt).getTime() + s.minutes * 60000).toISOString();
      events.push({
        uid: `slot-${s.id}`,
        summary: `Supervision consultation${s.agenda ? ` — ${s.agenda}` : ''}`,
        location: s.mode === 'ONLINE' ? 'Online' : s.venue,
        startIso: s.startsAt,
        endIso: end,
      });
    }

    // Past/completed consultations.
    for (const c of consultationsOf(student.id)) {
      if (c.status !== 'COMPLETED') continue;
      const end = new Date(new Date(c.heldAt).getTime() + 30 * 60000).toISOString();
      events.push({
        uid: `consultation-${c.id}`,
        summary: `Consultation — ${c.agenda}`,
        startIso: c.heldAt,
        endIso: end,
      });
    }
  }

  return new Response(buildIcal(events), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="consultations.ics"',
    },
  });
}
