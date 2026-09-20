import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { currentPrincipal } from '@/lib/auth/current';
import { can } from '@/lib/rbac/policy';
import { aggregatePanel, PROFILE_A, normalisePercentage } from '@/lib/assessment';
import {
  RUBRICS, sessionsFor, findStudent, projectOf, findPerson,
  sheetOf, setMark, submitSheet, rawTotalOf, toAssessorEntries,
} from '@/lib/data/store';

export const dynamic = 'force-dynamic';

type Component = 'p1' | 'p2';

async function saveMarks(formData: FormData) {
  'use server';
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');

  const component = String(formData.get('component')) as Component;
  const assigned = sessionsFor(component).flatMap((s) => s.studentIds);
  const errors: string[] = [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('m:')) continue;
    const [, studentId, criterionId] = key.split(':');
    if (!studentId || !criterionId) continue;

    // Authorisation is re-checked per student on write, not just at page render.
    const decision = can(principal, 'presentation.grade', {
      memberId: studentId, assignedMemberIds: assigned,
    });
    if (!decision.allow) { errors.push(`${studentId}: ${decision.reason}`); continue; }

    const raw = String(value).trim();
    const result = setMark(principal.userId, studentId, component, criterionId,
                           raw === '' ? null : Number(raw));
    if (!result.ok) errors.push(`${findStudent(studentId)?.surname ?? studentId}: ${result.error}`);
  }

  revalidatePath(`/grading/${component}`);
  redirect(`/grading/${component}?${errors.length ? `e=${encodeURIComponent(errors[0]!)}` : 'saved=1'}`);
}

async function submitAll(formData: FormData) {
  'use server';
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');
  const component = String(formData.get('component')) as Component;
  const n = submitSheet(principal.userId, component, new Date().toISOString());
  revalidatePath(`/grading/${component}`);
  redirect(`/grading/${component}?submitted=${n}`);
}

export default async function Grading({
  params, searchParams,
}: { params: Promise<{ component: string }>; searchParams: Promise<{ saved?: string; e?: string; submitted?: string }> }) {
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');

  const { component: raw } = await params;
  const component: Component = raw === 'p1' ? 'p1' : 'p2';
  const { saved, e, submitted } = await searchParams;

  const sessions = sessionsFor(component);
  const assigned = sessions.flatMap((s) => s.studentIds);
  const first = assigned[0];
  const gate = first
    ? can(principal, 'presentation.grade', { memberId: first, assignedMemberIds: assigned })
    : ({ allow: false, reason: 'No students are scheduled for this presentation.' } as const);
  if (!gate.allow) {
    return <><h1 className="page">Not permitted</h1><p className="lede">{gate.reason}</p></>;
  }

  const rubric = RUBRICS[component];
  const mine = assigned.map((id) => sheetOf(principal.userId, id, component));
  const locked = mine.some((s) => s?.submitted);
  const done = mine.filter((s) => rawTotalOf(s) !== null).length;

  return (
    <>
      <h1 className="page">{rubric.title}</h1>
      <p className="lede">
        Your sheet covers {assigned.length} students across {sessions.length} sessions.
        Marks out of {rubric.max}; the total is computed, never typed.
      </p>

      {saved && <div className="notice">Marks saved.</div>}
      {submitted && <div className="notice">Sheet submitted — {submitted} rows locked.</div>}
      {e && <div className="notice bad">{e}</div>}
      {locked && <div className="notice bad">This sheet is submitted. A coordinator must reopen it before you can change a mark.</div>}

      <form action={saveMarks}>
        <input type="hidden" name="component" value={component} />
        <table className="grid">
          <thead>
            <tr>
              <th style={{ width: 40 }}>S/No</th>
              <th style={{ width: 92 }}>Student ID</th>
              <th style={{ width: 200 }}>Student</th>
              {rubric.criteria.map((c) => (
                <th key={c.id} className="num" style={{ width: 58 }}>
                  {c.label}<span className="max">{c.max}</span>
                </th>
              ))}
              <th className="num" style={{ width: 58 }}>Total<span className="max">{rubric.max}</span></th>
              <th className="num" style={{ width: 78 }}>Normalised</th>
              <th style={{ width: 96 }}>Panel</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((slot) => {
              const project = projectOf(slot.studentIds[0]!);
              return (
                <>
                  <tr className={slot.joint ? 'band' : 'band solo'} key={`b-${slot.serial}`}>
                    <td className="sess" rowSpan={slot.studentIds.length + 1}>{slot.serial}
                      {slot.joint && <div style={{ fontSize: 10 }} className="muted">pair</div>}</td>
                    <td colSpan={rubric.criteria.length + 5}>
                      {slot.joint
                        ? <><strong>Joint project, {slot.studentIds.length} members — grade each member separately.</strong>{' '}
                            <em>{project?.title}</em></>
                        : <><strong>Two individual projects sharing this slot.</strong>{' '}
                            {slot.studentIds.map((id) => projectOf(id)?.title).join(' · ')}</>}
                    </td>
                  </tr>
                  {slot.studentIds.map((id) => {
                    const student = findStudent(id)!;
                    const sheet = sheetOf(principal.userId, id, component);
                    const total = rawTotalOf(sheet);
                    const panel = aggregatePanel(toAssessorEntries(id, component), PROFILE_A.panel);
                    return (
                      <tr key={id}>
                        <td className="mono" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{student.studentNumber}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <strong>{student.surname}</strong>, {student.otherNames}
                        </td>
                        {rubric.criteria.map((c) => (
                          <td key={c.id} className="num" style={{ padding: 2 }}>
                            <input className="mark" name={`m:${id}:${c.id}`} inputMode="numeric"
                                   min={0} max={c.max} type="number" disabled={locked}
                                   defaultValue={sheet?.marks[c.id] ?? ''} />
                          </td>
                        ))}
                        <td className="total">{total ?? '—'}</td>
                        <td className="num muted mono">
                          {total === null ? '—' : `${normalisePercentage(total, rubric.max).toFixed(1)}%`}
                        </td>
                        <td style={{ fontSize: 11.5 }}>
                          {panel.status === 'OK'
                            ? <span className="muted">hidden</span>
                            : <span className="chip warn" style={{ whiteSpace: 'nowrap' }}>
                                {panel.status === 'MODERATION_REQUIRED' ? 'moderation' : 'incomplete'}
                              </span>}
                        </td>
                      </tr>
                    );
                  })}
                </>
              );
            })}
          </tbody>
        </table>

        <div style={{ marginTop: 14 }}>
          <button className="btn" type="submit" disabled={locked}>Save marks</button>
          <span className="muted" style={{ marginLeft: 12 }}>
            {done} of {assigned.length} rows have marks. A row left blank is recorded as not
            assessed by you and excluded from the panel mean — never scored zero.
          </span>
        </div>
      </form>

      <form action={submitAll} style={{ marginTop: 10 }}>
        <input type="hidden" name="component" value={component} />
        <button className="btn ghost" type="submit" disabled={locked}>Submit sheet</button>
        <span className="muted" style={{ marginLeft: 12 }}>
          Submitting is the signature: it locks every row and records {findPerson(principal.userId)?.fullName} and the time.
        </span>
      </form>
    </>
  );
}
