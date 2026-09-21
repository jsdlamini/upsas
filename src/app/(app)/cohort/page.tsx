import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { currentPrincipal } from '@/lib/auth/current';
import { can } from '@/lib/rbac/policy';
import {
  CYCLE, STUDENTS, findStudent, findPerson, allPeople,
  enrolmentOf, setEnrolment, deadlinesFor, saveDeadline, removeDeadline,
  extensionFor, grantExtension, withdrawExtension, deadlineStatusFor,
  issueResetCode, takeIssuedCode, outstandingResetFor,
} from '@/lib/data/store';
import {
  STATUS_LABEL, STATUS_MEANING, describe,
  type EnrolmentStatus, type CarriedComponent,
} from '@/lib/enrolment/status';
import { shortState } from '@/lib/deadlines/schedule';

export const dynamic = 'force-dynamic';

const STATUSES: EnrolmentStatus[] = ['ACTIVE', 'DEFERRED', 'WITHDRAWN', 'SUPPLEMENTARY', 'CARRY_OVER'];

/**
 * Eswatini keeps UTC+2 the whole year, so a fixed offset is honest here and a
 * timezone library would be pretending to solve a problem the country does not
 * have. If that ever changes, this is the one place to fix.
 */
const OFFSET_MINUTES = 120;

function toLocalInput(iso: string): string {
  const local = new Date(Date.parse(iso) + OFFSET_MINUTES * 60_000);
  return local.toISOString().slice(0, 16);
}

function fromLocalInput(value: string): string {
  if (!value) return '';
  const parsed = Date.parse(`${value}:00+02:00`);
  return Number.isNaN(parsed) ? '' : new Date(parsed).toISOString();
}

function showDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Mbabane',
  });
}

async function guard() {
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');
  const decision = can(principal, 'config.edit', {});
  if (!decision.allow) redirect(`/cohort?e=${encodeURIComponent(JSON.stringify([decision.reason]))}`);
  return principal;
}

function back(tab: string, params = ''): never {
  redirect(`/cohort?t=${tab}${params}`);
}

/* ------------------------------------------------------------- actions */

async function changeEnrolment(formData: FormData) {
  'use server';
  const principal = await guard();

  const studentId = String(formData.get('studentId'));
  const status = String(formData.get('status')) as EnrolmentStatus;
  const carried: CarriedComponent[] = [];
  const componentKey = String(formData.get('carriedKey') ?? '').trim();
  if (componentKey) {
    carried.push({
      componentKey,
      percentage: Number(String(formData.get('carriedPct') ?? '0')),
      fromCycleId: String(formData.get('carriedCycle') ?? '').trim(),
      ref: String(formData.get('carriedRef') ?? '').trim(),
    });
  }

  const result = setEnrolment(studentId, {
    status,
    effectiveFrom: String(formData.get('effectiveFrom') ?? '').trim(),
    note: String(formData.get('note') ?? ''),
    carried,
  }, principal.userId);

  if (!result.ok) back('enrolment', `&e=${encodeURIComponent(JSON.stringify(result.errors.slice(0, 6)))}`);
  revalidatePath('/cohort');
  back('enrolment', `&done=${encodeURIComponent(`${findStudent(studentId)?.surname ?? studentId} is now ${STATUS_LABEL[status].toLowerCase()}`)}`);
}

async function upsertDeadline(formData: FormData) {
  'use server';
  await guard();
  const result = saveDeadline({
    cycleId: CYCLE,
    key: String(formData.get('key') ?? '').trim().toLowerCase(),
    label: String(formData.get('label') ?? '').trim(),
    dueAt: fromLocalInput(String(formData.get('dueAt') ?? '')),
    graceMinutes: Number(String(formData.get('graceMinutes') ?? '0')),
    published: formData.get('published') === 'on',
    note: String(formData.get('note') ?? '').trim(),
  });
  if (!result.ok) back('deadlines', `&e=${encodeURIComponent(JSON.stringify(result.errors.slice(0, 6)))}`);
  revalidatePath('/cohort');
  back('deadlines', '&done=' + encodeURIComponent('Schedule updated'));
}

async function dropDeadline(formData: FormData) {
  'use server';
  await guard();
  removeDeadline(String(formData.get('key')));
  revalidatePath('/cohort');
  back('deadlines', '&done=' + encodeURIComponent('Deadline removed'));
}

async function addExtension(formData: FormData) {
  'use server';
  const principal = await guard();
  const result = grantExtension({
    studentId: String(formData.get('studentId')),
    deadlineKey: String(formData.get('deadlineKey')),
    newDueAt: fromLocalInput(String(formData.get('newDueAt') ?? '')),
    kind: String(formData.get('kind')) === 'ACCOMMODATION' ? 'ACCOMMODATION' : 'EXTENSION',
    reason: String(formData.get('reason') ?? ''),
    approvedBy: principal.userId,
  });
  if (!result.ok) back('extensions', `&e=${encodeURIComponent(JSON.stringify(result.errors.slice(0, 6)))}`);
  revalidatePath('/cohort');
  back('extensions', '&done=' + encodeURIComponent('Extension recorded'));
}

async function dropExtension(formData: FormData) {
  'use server';
  await guard();
  withdrawExtension(String(formData.get('studentId')), String(formData.get('deadlineKey')));
  revalidatePath('/cohort');
  back('extensions', '&done=' + encodeURIComponent('Extension withdrawn'));
}

async function issueCode(formData: FormData) {
  'use server';
  const principal = await guard();
  const userId = String(formData.get('userId'));
  const issued = issueResetCode(userId, principal.userId);
  if (!issued) back('recovery', `&e=${encodeURIComponent('["No such account."]')}`);
  revalidatePath('/cohort');
  // The code itself is handed back in memory, never in this URL.
  back('recovery', '&issued=1');
}

/* ---------------------------------------------------------------- page */

export default async function Cohort({
  searchParams,
}: { searchParams: Promise<{ t?: string; e?: string; done?: string; issued?: string }> }) {
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');

  const gate = can(principal, 'config.edit', {});
  if (!gate.allow) {
    return (
      <>
        <h1 className="page">Not permitted</h1>
        <p className="lede">{gate.reason} The cohort register is maintained by the project coordinator.</p>
      </>
    );
  }

  const { t, e, done, issued } = await searchParams;
  const tab = t === 'deadlines' || t === 'extensions' || t === 'recovery' ? t : 'enrolment';

  let errors: string[] = [];
  if (e) { try { const parsed: unknown = JSON.parse(e); if (Array.isArray(parsed)) errors = parsed.map(String); } catch { errors = [e]; } }

  const deadlines = deadlinesFor();
  const code = issued ? takeIssuedCode(principal.userId) : null;

  return (
    <>
      <h1 className="page">Cohort register</h1>
      <p className="lede">
        The parts of a cycle that are about people rather than marks: who is being assessed,
        what they are working to, and who needs their way back in.
      </p>

      <div className="tabs-switch">
        <a href="/cohort?t=enrolment" className={tab === 'enrolment' ? 'on' : undefined}>Enrolment</a>
        <a href="/cohort?t=deadlines" className={tab === 'deadlines' ? 'on' : undefined}>Deadlines</a>
        <a href="/cohort?t=extensions" className={tab === 'extensions' ? 'on' : undefined}>Extensions</a>
        <a href="/cohort?t=recovery" className={tab === 'recovery' ? 'on' : undefined}>Account access</a>
      </div>

      {done && <div className="notice" role="status">{done}.</div>}
      {errors.length > 0 && (
        <div className="notice bad" role="alert">
          <strong>Not saved.</strong>
          <ul className="errorlist">{errors.map((msg) => <li key={msg}>{msg}</li>)}</ul>
        </div>
      )}

      {/* ------------------------------------------------------ enrolment */}
      {tab === 'enrolment' && (
        <>
          <p>
            Most students are active and need no record here. The rest are the ones a marking
            system usually gets wrong: someone who defers in March, someone who withdraws in
            week four, someone repeating the project with a presentation already passed.
          </p>
          <ul className="errorlist">
            {STATUSES.filter((s) => s !== 'ACTIVE').map((s) => (
              <li key={s}><strong>{STATUS_LABEL[s]}.</strong> {STATUS_MEANING[s]}</li>
            ))}
          </ul>

          {STUDENTS.map((student) => {
            const enrolment = enrolmentOf(student.id);
            const carried = enrolment.carried[0];
            return (
              <details key={student.id} open={enrolment.status !== 'ACTIVE'}>
                <summary style={{ cursor: 'pointer', padding: '10px 0' }}>
                  <strong>{student.surname}, {student.otherNames}</strong>{' '}
                  <span className="mono muted" style={{ fontSize: 12 }}>{student.studentNumber}</span>{' '}
                  {enrolment.status === 'ACTIVE'
                    ? <span className="chip ok">Active</span>
                    : <span className="chip warn">{describe(enrolment)}</span>}
                </summary>
                <form action={changeEnrolment} className="box">
                  <input type="hidden" name="studentId" value={student.id} />
                  <div className="form-grid">
                    <p>
                      <label className="field-label" htmlFor={`st-${student.id}`}>Status</label>
                      <select id={`st-${student.id}`} name="status" defaultValue={enrolment.status}>
                        {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                      </select>
                    </p>
                    <p>
                      <label className="field-label" htmlFor={`ef-${student.id}`}>Effective from</label>
                      <input id={`ef-${student.id}`} name="effectiveFrom" type="date"
                             defaultValue={enrolment.effectiveFrom.slice(0, 10)} />
                    </p>
                  </div>
                  <p>
                    <label className="field-label" htmlFor={`nt-${student.id}`}>
                      Why, and on whose decision
                    </label>
                    <textarea id={`nt-${student.id}`} name="note" rows={2} defaultValue={enrolment.note}
                              style={{ width: '100%' }} />
                  </p>

                  <h2 style={{ fontSize: 13 }}>Credit carried from an earlier cycle</h2>
                  <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
                    Carried as a percentage, not a raw total: the earlier cycle&apos;s form may have had a
                    different maximum. A carried component is not re-marked and does not appear on a
                    session list.
                  </p>
                  <div className="form-grid">
                    <p>
                      <label className="field-label" htmlFor={`ck-${student.id}`}>Component</label>
                      <select id={`ck-${student.id}`} name="carriedKey" defaultValue={carried?.componentKey ?? ''}>
                        <option value="">None</option>
                        <option value="P1">Presentation 1</option>
                        <option value="P2">Presentation 2</option>
                        <option value="DOCUMENTATION">Documentation</option>
                      </select>
                    </p>
                    <p>
                      <label className="field-label" htmlFor={`cp-${student.id}`}>Percentage awarded</label>
                      <input id={`cp-${student.id}`} name="carriedPct" type="number" min={0} max={100}
                             defaultValue={carried?.percentage ?? ''} />
                    </p>
                    <p>
                      <label className="field-label" htmlFor={`cc-${student.id}`}>Cycle</label>
                      <input id={`cc-${student.id}`} name="carriedCycle" type="text"
                             placeholder="2024/2025" defaultValue={carried?.fromCycleId ?? ''} />
                    </p>
                    <p>
                      <label className="field-label" htmlFor={`cr-${student.id}`}>Board decision</label>
                      <input id={`cr-${student.id}`} name="carriedRef" type="text"
                             placeholder="BoE 2025-07-11 item 4.2" defaultValue={carried?.ref ?? ''} />
                    </p>
                  </div>
                  <button className="btn" type="submit">Save status</button>
                </form>
              </details>
            );
          })}
        </>
      )}

      {/* ------------------------------------------------------ deadlines */}
      {tab === 'deadlines' && (
        <>
          <p>
            Dates the whole cohort works to. Until they live here, lateness is decided by
            whoever read the handbook last. Grace absorbs the student submitting at 23:59 on
            a slow connection; it is not a second deadline and students are not told about it.
          </p>

          <div className="table-wrap">
            <table className="list">
              <thead>
                <tr>
                  <th scope="col">Deadline</th>
                  <th scope="col" style={{ width: 200 }}>Due</th>
                  <th scope="col" style={{ width: 90 }}>Grace</th>
                  <th scope="col" style={{ width: 120 }}>Shown to students</th>
                  <th scope="col" style={{ width: 100 }} />
                </tr>
              </thead>
              <tbody>
                {deadlines.length === 0 && (
                  <tr><td colSpan={5} className="muted">No dates set for {CYCLE} yet.</td></tr>
                )}
                {deadlines.map((deadline) => (
                  <tr key={deadline.key}>
                    <td>
                      <strong>{deadline.label}</strong>
                      <div className="mono muted" style={{ fontSize: 11.5 }}>{deadline.key}</div>
                    </td>
                    <td>{showDate(deadline.dueAt)}</td>
                    <td className="num">{deadline.graceMinutes} min</td>
                    <td>{deadline.published ? <span className="chip ok">published</span> : <span className="chip">draft</span>}</td>
                    <td>
                      <form action={dropDeadline}>
                        <input type="hidden" name="key" value={deadline.key} />
                        <button className="btn ghost sm" type="submit">Remove</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>Add or amend a deadline</h2>
          <form action={upsertDeadline} className="box">
            <div className="form-grid">
              <p>
                <label className="field-label" htmlFor="dl-label">Name students will recognise</label>
                <input id="dl-label" name="label" type="text" required
                       placeholder="Chapters 1 and 2 submitted to supervisor" />
              </p>
              <p>
                <label className="field-label" htmlFor="dl-key">Reference</label>
                <input id="dl-key" name="key" type="text" required placeholder="chapters-1-2"
                       pattern="[a-z0-9-]+" />
              </p>
              <p>
                <label className="field-label" htmlFor="dl-due">Due date and time</label>
                <input id="dl-due" name="dueAt" type="datetime-local" required />
              </p>
              <p>
                <label className="field-label" htmlFor="dl-grace">Grace, in minutes</label>
                <input id="dl-grace" name="graceMinutes" type="number" min={0} max={1440} defaultValue={60} />
              </p>
            </div>
            <p>
              <label className="role-check" style={{ display: 'inline-flex' }}>
                <input type="checkbox" name="published" defaultChecked /> Show this to students
              </label>
            </p>
            <p>
              <label className="field-label" htmlFor="dl-note">Note (optional)</label>
              <input id="dl-note" name="note" type="text" style={{ width: '100%' }} />
            </p>
            <button className="btn" type="submit">Save deadline</button>
            <span className="muted" style={{ marginLeft: 12, fontSize: 12.5 }}>
              An existing reference is amended rather than duplicated.
            </span>
          </form>
        </>
      )}

      {/* ----------------------------------------------------- extensions */}
      {tab === 'extensions' && (
        <>
          <p>
            An extension moves one student&apos;s date later. It never moves one earlier — to bring a
            date forward, change the deadline for everyone. The grounds you record stay here:
            a supervisor sees that a date differs, not why.
          </p>

          <div className="table-wrap">
            <table className="list">
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  <th scope="col">Deadline</th>
                  <th scope="col" style={{ width: 190 }}>Standard</th>
                  <th scope="col" style={{ width: 190 }}>Theirs</th>
                  <th scope="col" style={{ width: 130 }}>Kind</th>
                  <th scope="col">Grounds</th>
                  <th scope="col" style={{ width: 110 }} />
                </tr>
              </thead>
              <tbody>
                {STUDENTS.flatMap((student) =>
                  deadlines.map((deadline) => {
                    const extension = extensionFor(student.id, deadline.key);
                    if (!extension) return null;
                    return (
                      <tr key={`${student.id}-${deadline.key}`}>
                        <td><strong>{student.surname}</strong>, {student.otherNames}</td>
                        <td>{deadline.label}</td>
                        <td className="muted">{showDate(deadline.dueAt)}</td>
                        <td>{showDate(extension.newDueAt)}</td>
                        <td>
                          {extension.kind === 'ACCOMMODATION'
                            ? <span className="chip">accommodation</span>
                            : <span className="chip">extension</span>}
                        </td>
                        <td className="muted" style={{ fontSize: 12.5 }}>{extension.reason}</td>
                        <td>
                          <form action={dropExtension}>
                            <input type="hidden" name="studentId" value={student.id} />
                            <input type="hidden" name="deadlineKey" value={deadline.key} />
                            <button className="btn ghost sm" type="submit">Withdraw</button>
                          </form>
                        </td>
                      </tr>
                    );
                  }).filter(Boolean),
                )}
                {STUDENTS.every((student) => deadlines.every((d) => !extensionFor(student.id, d.key))) && (
                  <tr><td colSpan={7} className="muted">No extensions granted this cycle.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <h2>Grant an extension</h2>
          <form action={addExtension} className="box">
            <div className="form-grid">
              <p>
                <label className="field-label" htmlFor="ex-student">Student</label>
                <select id="ex-student" name="studentId">
                  {STUDENTS.map((s) => (
                    <option key={s.id} value={s.id}>{s.surname}, {s.otherNames} ({s.studentNumber})</option>
                  ))}
                </select>
              </p>
              <p>
                <label className="field-label" htmlFor="ex-deadline">Deadline</label>
                <select id="ex-deadline" name="deadlineKey">
                  {deadlines.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                </select>
              </p>
              <p>
                <label className="field-label" htmlFor="ex-due">Their new date and time</label>
                <input id="ex-due" name="newDueAt" type="datetime-local" required />
              </p>
              <p>
                <label className="field-label" htmlFor="ex-kind">Kind</label>
                <select id="ex-kind" name="kind" defaultValue="EXTENSION">
                  <option value="EXTENSION">Extension — a one-off, for this deadline</option>
                  <option value="ACCOMMODATION">Accommodation — an agreed adjustment</option>
                </select>
              </p>
            </div>
            <p>
              <label className="field-label" htmlFor="ex-reason">Grounds, kept to this screen</label>
              <textarea id="ex-reason" name="reason" rows={2} style={{ width: '100%' }} required />
            </p>
            <button className="btn" type="submit">Record extension</button>
          </form>
        </>
      )}

      {/* ------------------------------------------------------- recovery */}
      {tab === 'recovery' && (
        <>
          <p>
            Sign-in is local to the department, so there is no external account to recover
            through. Issue a code and read it to the person, having satisfied yourself they
            are who they say. You never see their password, the code works once, and it
            expires after thirty minutes.
          </p>

          {code && (
            <div className="notice" role="status">
              <strong>Code for {findPerson(code.forUserId)?.fullName}: <span className="mono">{code.code}</span></strong>
              <p style={{ margin: '6px 0 0' }}>
                Valid until {showDate(code.expiresAt)}. This is the only time it is shown — reload
                the page and it is gone. Changing their password will sign them out everywhere.
              </p>
            </div>
          )}

          <div className="table-wrap">
            <table className="list">
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col" style={{ width: 160 }}>Username</th>
                  <th scope="col" style={{ width: 140 }}>Account</th>
                  <th scope="col" style={{ width: 170 }}>Outstanding code</th>
                  <th scope="col" style={{ width: 140 }} />
                </tr>
              </thead>
              <tbody>
                {allPeople().map((person) => {
                  const outstanding = outstandingResetFor(person.id);
                  return (
                    <tr key={person.id}>
                      <td><strong>{person.fullName}</strong></td>
                      <td className="mono">{person.username}</td>
                      <td>
                        {person.status === 'PENDING_APPROVAL'
                          ? <span className="chip warn">awaiting approval</span>
                          : <span className="chip ok">{(person.status ?? 'ACTIVE').toLowerCase()}</span>}
                      </td>
                      <td className="muted" style={{ fontSize: 12.5 }}>
                        {outstanding ? `expires ${showDate(outstanding.expiresAt)}` : '—'}
                      </td>
                      <td>
                        <form action={issueCode}>
                          <input type="hidden" name="userId" value={person.id} />
                          <button className="btn ghost sm" type="submit">
                            {outstanding ? 'Reissue' : 'Issue code'}
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 12.5 }}>
            Issuing a new code cancels any earlier one, so only the latest ever works.
          </p>
        </>
      )}

      <h2>What students are working to</h2>
      <div className="table-wrap">
        <table className="list">
          <caption className="sr-only">Published deadlines and how many students have a different date.</caption>
          <thead>
            <tr>
              <th scope="col">Deadline</th>
              <th scope="col" style={{ width: 200 }}>Due</th>
              <th scope="col" style={{ width: 140 }}>State</th>
              <th scope="col" style={{ width: 150 }}>Different dates</th>
            </tr>
          </thead>
          <tbody>
            {deadlines.filter((d) => d.published).map((deadline) => {
              const differing = STUDENTS.filter((s) => extensionFor(s.id, deadline.key)).length;
              const status = deadlineStatusFor(STUDENTS[0]?.id ?? '', deadline);
              return (
                <tr key={deadline.key}>
                  <td>{deadline.label}</td>
                  <td>{showDate(deadline.dueAt)}</td>
                  <td className="muted">{shortState(status)}</td>
                  <td className="num">{differing || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
