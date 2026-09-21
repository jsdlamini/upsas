import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/lib/auth/current';
import { can } from '@/lib/rbac/policy';
import {
  findPerson, findStudent, projectOf, openSlotsFor, bookingsOf, slotsOf,
  bookSlot, cancelBooking, addSlots, confirmBooking, declineBooking, MIN_NOTICE_HOURS, consultationsOf,
  requestMeeting, meetingRequestsFor, myMeetingRequests, decideMeetingRequest,
} from '@/lib/data/store';

export const dynamic = 'force-dynamic';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    timeZone: 'Africa/Mbabane',
  });

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Mbabane' });

function groupByDay<T extends { startsAt: string }>(slots: T[]): Array<[string, T[]]> {
  const map = new Map<string, T[]>();
  for (const s of slots) {
    const day = dayLabel(s.startsAt);
    const list = map.get(day);
    if (list) list.push(s); else map.set(day, [s]);
  }
  return [...map.entries()];
}

async function book(formData: FormData) {
  'use server';
  const p = await currentPrincipal();
  if (!p) redirect('/login');
  const d = can(p, 'consultation.book');
  if (!d.allow) redirect(`/book?e=${encodeURIComponent(d.reason)}`);
  const person = findPerson(p.userId);
  if (!person?.studentId) redirect('/book?e=Only+students+book+from+here.');
  const r = bookSlot(String(formData.get('slotId')), person.studentId,
                     String(formData.get('agenda') ?? ''), new Date(),
                     String(formData.get('mode')) as 'IN_PERSON' | 'ONLINE',
                     String(formData.get('meetingLink') ?? ''));
  redirect(`/book?${r.ok ? `saved=1&toast=${encodeURIComponent('Booking requested — awaiting supervisor confirmation.')}` : `e=${encodeURIComponent(r.error)}`}`);
}

async function cancel(formData: FormData) {
  'use server';
  const p = await currentPrincipal();
  if (!p) redirect('/login');
  const person = findPerson(p.userId);
  if (!person?.studentId) redirect('/book?e=Not+your+booking.');
  const r = cancelBooking(String(formData.get('slotId')), person.studentId, new Date());
  redirect(`/book?${r.ok ? `saved=1&toast=${encodeURIComponent('Booking cancelled.')}` : `e=${encodeURIComponent(r.error)}`}`);
}

async function publishSlots(formData: FormData) {
  'use server';
  const p = await currentPrincipal();
  if (!p) redirect('/login');
  if (!p.permissions.includes('consultation.grade')) redirect('/book?e=Only+supervisors+publish+availability.');
  const hours = String(formData.get('hours') ?? '').split(',').map((h) => h.trim()).filter(Boolean);
  const n = addSlots(p.userId, String(formData.get('date')), hours,
                     String(formData.get('mode')) as 'IN_PERSON' | 'ONLINE', String(formData.get('venue') ?? ''));
  redirect(`/book?saved=1&added=${n}&toast=${encodeURIComponent(`Published ${n} slot${n === 1 ? '' : 's'}.`)}`);
}

async function confirm(formData: FormData) {
  'use server';
  const p = await currentPrincipal();
  if (!p) redirect('/login');
  const r = confirmBooking(String(formData.get('slotId')), p.userId);
  redirect(`/book?${r.ok ? `saved=1&toast=${encodeURIComponent('Booking confirmed.')}` : `e=${encodeURIComponent(r.error)}`}`);
}

async function decline(formData: FormData) {
  'use server';
  const p = await currentPrincipal();
  if (!p) redirect('/login');
  const r = declineBooking(String(formData.get('slotId')), p.userId);
  redirect(`/book?${r.ok ? `saved=1&toast=${encodeURIComponent('Booking declined.')}` : `e=${encodeURIComponent(r.error)}`}`);
}

async function requestMeetingAction(formData: FormData) {
  'use server';
  const p = await currentPrincipal();
  if (!p) redirect('/login');
  const person = findPerson(p.userId);
  if (!person?.studentId) redirect('/book?e=Only+students+request+from+here.');
  const project = projectOf(person.studentId);
  if (!project) redirect('/book?e=You+have+no+supervisor+yet.');
  const r = requestMeeting({
    studentId: person.studentId,
    supervisorId: project.supervisorId,
    agenda: String(formData.get('agenda') ?? ''),
    preferredTimes: String(formData.get('preferredTimes') ?? ''),
  });
  redirect(`/book?${r.ok ? `saved=1&toast=${encodeURIComponent('Meeting request sent.')}` : `e=${encodeURIComponent(r.error)}`}`);
}

async function decideMeeting(formData: FormData) {
  'use server';
  const p = await currentPrincipal();
  if (!p) redirect('/login');
  const decision = String(formData.get('decision') ?? 'DECLINED') as 'APPROVED' | 'DECLINED';
  decideMeetingRequest(String(formData.get('id') ?? ''), decision);
  redirect(`/book?saved=1&toast=${encodeURIComponent(decision === 'APPROVED' ? 'Meeting request approved.' : 'Meeting request declined.')}`);
}

export default async function Book({
  searchParams,
}: { searchParams: Promise<{ saved?: string; e?: string; added?: string }> }) {
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');
  const { saved, e, added } = await searchParams;
  const person = findPerson(principal.userId);
  const nowIso = new Date().toISOString();

  if (person?.studentId) {
    const project = projectOf(person.studentId);
    if (!project) {
      return <><h1 className="page">Book a consultation</h1>
        <p className="lede">You have no supervisor yet. Choose a topic first and wait for allocation.</p></>;
    }
    const open = openSlotsFor(project.supervisorId, nowIso);
    const mine = bookingsOf(person.studentId).filter((s) => s.startsAt > nowIso);
    const held = consultationsOf(person.studentId).filter((c) => c.status === 'COMPLETED').length;
    const myRequests = myMeetingRequests(person.studentId);
    const nextOpen = open[0];
    const supervisor = findPerson(project.supervisorId);

    return (
      <>
        <h1 className="page">Book a consultation</h1>
        <p className="lede">
          Your supervisor is <strong>{supervisor?.fullName}</strong>. You have held <strong>{held}</strong>{' '}
          sessions so far. Slots need {MIN_NOTICE_HOURS} hours&apos; notice and you may hold one booking per day.
          {nextOpen && <> Next open: <span className="mono">{when(nextOpen.startsAt)}</span>.</>}
          {' '}<a href="/api/ical" style={{ marginLeft: 6 }}>Export calendar (.ics) →</a>
        </p>

        <div className="journey">
          <span className="done">1 · Choose a slot</span>
          <span>2 · Supervisor confirms</span>
          <span>3 · Meet &amp; confirm</span>
          <span>4 · It counts toward your minimum</span>
        </div>

        {saved && <div className="notice">Done.</div>}
        {e && <div className="notice bad">{e}</div>}

        {mine.length > 0 && (
          <div className="box">
            <strong>Booked</strong>
            {mine.map((s) => (
              <p key={s.id} style={{ margin: '6px 0 0' }}>
                <span className="mono">{when(s.startsAt)}</span> · {s.mode === 'ONLINE' ? 'online' : s.venue} · {s.agenda}
                <span className={`chip ${s.status === 'CONFIRMED' ? 'ok' : 'warn'}`} style={{ marginLeft: 6 }}>
                  {s.status === 'CONFIRMED' ? 'confirmed' : 'awaiting confirmation'}
                </span>
                {s.meetingLink && (
                  <a href={s.meetingLink} target="_blank" rel="noreferrer" style={{ marginLeft: 6, fontSize: 12 }}>
                    {s.mode === 'ONLINE' ? 'Meeting link' : 'Details'}
                  </a>
                )}
                <form action={cancel} style={{ display: 'inline', marginLeft: 10 }}>
                  <input type="hidden" name="slotId" value={s.id} />
                  <button className="btn ghost" style={{ padding: '2px 9px', fontSize: 11 }}>Cancel</button>
                </form>
              </p>
            ))}
          </div>
        )}

        {myRequests.length > 0 && (
          <div className="box">
            <strong>Meeting requests</strong>
            {myRequests.map((r) => (
              <p key={r.id} style={{ margin: '6px 0 0' }}>
                <span className="muted" style={{ fontSize: 12 }}>{r.preferredTimes}</span> · {r.agenda}{' '}
                <span className={`chip ${r.status === 'APPROVED' ? 'ok' : r.status === 'DECLINED' ? 'bad' : 'warn'}`}>
                  {r.status.toLowerCase()}
                </span>
              </p>
            ))}
          </div>
        )}

        <h2 style={{ fontSize: 15 }}>Open slots</h2>
        {open.length === 0 ? (
          <div className="box">
            <strong>No open slots right now.</strong>
            <p className="muted" style={{ margin: '6px 0 0' }}>
              Send a request below and your supervisor can open a slot for you — no need to chase them in person.
            </p>
          </div>
        ) : (
          <div className="slot-days">
            {groupByDay(open).slice(0, 4).map(([day, daySlots]) => (
              <div className="slot-day" key={day}>
                <div className="slot-day-head">{day}</div>
                <div className="table-wrap">
                  <table className="list" style={{ marginTop: 0 }}>
                    <thead><tr><th style={{ width: '22%' }}>When</th><th style={{ width: '18%' }}>Where</th>
                      <th>What you want to cover</th><th>Mode + link</th><th style={{ width: '12%' }}></th></tr></thead>
                    <tbody>
                      {daySlots.map((s) => (
                        <tr key={s.id}>
                          <td className="mono">{when(s.startsAt).split(' ').slice(1).join(' ')}</td>
                          <td className="muted">{s.mode === 'ONLINE' ? 'Online' : s.venue}</td>
                          <td>
                            <form action={book} id={`f-${s.id}`}>
                              <input type="hidden" name="slotId" value={s.id} />
                              <input name="agenda" placeholder="e.g. Chapter 3 draft and methodology"
                                     style={{ width: '100%', padding: 6 }} />
                              <select name="mode" style={{ padding: 5, marginTop: 4, width: '100%' }}>
                                <option value="IN_PERSON">In person</option>
                                <option value="ONLINE">Virtual</option>
                              </select>
                              <input name="meetingLink" placeholder="Meeting link (if virtual)"
                                     style={{ width: '100%', padding: 6, marginTop: 4 }} />
                            </form>
                          </td>
                          <td className="muted" style={{ fontSize: 11 }}>{s.venue}</td>
                          <td><button className="btn" form={`f-${s.id}`} style={{ padding: '5px 12px', fontSize: 12 }}>Book</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="box" style={{ borderLeftColor: 'var(--accent)' }}>
          <strong>Request a meeting</strong>
          <p className="muted" style={{ margin: '6px 0 10px' }}>
            No slot suits, or nothing is open? Propose times and your supervisor will see the request.
          </p>
          <form action={requestMeetingAction} className="form-grid">
            <p style={{ gridColumn: '1 / -1' }}>
              <label>What you want to cover
                <input name="agenda" placeholder="e.g. Review methodology before Presentation 1" required />
              </label>
            </p>
            <p style={{ gridColumn: '1 / -1' }}>
              <label>Times that suit you
                <input name="preferredTimes" placeholder="e.g. Tue 10:00–12:00, Thu after 14:00" required />
              </label>
            </p>
            <div style={{ gridColumn: '1 / -1' }}>
              <button className="btn" type="submit">Send request</button>
            </div>
          </form>
        </div>
      </>
    );
  }

  // Supervisor view: publish availability and see who has booked.
  const mine = slotsOf(principal.userId);
  const upcoming = mine.filter((s) => s.startsAt > nowIso);
  const requests = meetingRequestsFor(principal.userId);
  return (
    <>
      <h1 className="page">My availability</h1>
      <p className="lede">
        Publish the slots you are willing to be booked into. Students see only their own
        supervisor&apos;s slots, and cannot book inside {MIN_NOTICE_HOURS} hours.
      </p>
      {saved && <div className="notice">Published{added ? ` — ${added} slots added` : ''}.</div>}
      {e && <div className="notice bad">{e}</div>}

      <form action={publishSlots} className="box">
        <input name="date" type="date" defaultValue="2026-09-22" style={{ padding: 7 }} required />{' '}
        <input name="hours" defaultValue="08,09,11,14" style={{ padding: 7, width: 160 }}
               title="Comma-separated hours" />{' '}
        <select name="mode" style={{ padding: 7 }}>
          <option value="IN_PERSON">In person</option>
          <option value="ONLINE">Online</option>
        </select>{' '}
        <input name="venue" defaultValue="CS-204" style={{ padding: 7, width: 110 }} />{' '}
        <button className="btn" type="submit">Publish slots</button>
        <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
          Duplicate times are ignored rather than doubled up.
        </p>
      </form>

      {requests.filter((r) => r.status === 'PENDING').length > 0 && (
        <div className="box" style={{ borderLeftColor: 'var(--ochre)' }}>
          <strong>Meeting requests</strong>
          <p className="muted" style={{ margin: '6px 0 10px' }}>
            Students asked for times when you had nothing open. Approve and publish a slot, or decline.
          </p>
          <div className="table-wrap">
            <table className="list" style={{ marginTop: 10 }}>
              <thead><tr><th>Student</th><th>Preferred times</th><th>Agenda</th><th></th></tr></thead>
              <tbody>
                {requests.filter((r) => r.status === 'PENDING').map((r) => {
                  const st = findStudent(r.studentId);
                  return (
                    <tr key={r.id}>
                      <td><strong>{st ? `${st.surname}, ${st.otherNames}` : r.studentId}</strong></td>
                      <td className="muted" style={{ fontSize: 12 }}>{r.preferredTimes}</td>
                      <td style={{ fontSize: 12 }}>{r.agenda}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <form action={decideMeeting} style={{ display: 'inline' }}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="decision" value="APPROVED" />
                          <button className="btn" style={{ padding: '3px 10px', fontSize: 12 }}>Approve</button>
                        </form>{' '}
                        <form action={decideMeeting} style={{ display: 'inline' }}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="decision" value="DECLINED" />
                          <button className="btn ghost" style={{ padding: '3px 10px', fontSize: 12 }}>Decline</button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <h2 style={{ fontSize: 15 }}>Upcoming</h2>
      <div className="table-wrap">
        <table className="list">
          <thead><tr><th style={{ width: '24%' }}>When</th><th style={{ width: '16%' }}>Where</th>
            <th style={{ width: '22%' }}>Booked by</th><th>Agenda</th><th style={{ width: '20%' }}></th></tr></thead>
          <tbody>
            {upcoming.slice(0, 16).map((s) => {
              const student = s.bookedByStudentId ? findStudent(s.bookedByStudentId) : null;
              return (
                <tr key={s.id}>
                  <td className="mono">{when(s.startsAt)}</td>
                  <td className="muted">{s.mode === 'ONLINE' ? 'Online' : s.venue}</td>
                  <td>{student
                    ? <strong>{student.surname}, {student.otherNames}</strong>
                    : <span className="muted">open</span>}</td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {s.agenda ?? '—'}
                    {s.meetingLink && <div style={{ fontSize: 11 }}><a href={s.meetingLink} target="_blank" rel="noreferrer">{s.meetingLink}</a></div>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {s.bookedByStudentId && s.status !== 'CONFIRMED' ? (
                      <>
                        <form action={confirm} style={{ display: 'inline' }}>
                          <input type="hidden" name="slotId" value={s.id} />
                          <button className="btn" style={{ padding: '3px 10px', fontSize: 12 }}>Confirm</button>
                        </form>{' '}
                        <form action={decline} style={{ display: 'inline' }}>
                          <input type="hidden" name="slotId" value={s.id} />
                          <button className="btn ghost" style={{ padding: '3px 10px', fontSize: 12 }}>Decline</button>
                        </form>
                      </>
                    ) : s.bookedByStudentId ? (
                      <span className="chip ok">confirmed</span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
