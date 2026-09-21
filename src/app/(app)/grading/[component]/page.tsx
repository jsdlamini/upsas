import { Fragment } from 'react';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { currentPrincipal } from '@/lib/auth/current';
import { can } from '@/lib/rbac/policy';
import { aggregatePanel, PROFILE_A, normalisePercentage } from '@/lib/assessment';
import { MarkGrid } from '@/components/mark-grid';
import {
  RUBRICS, sessionsFor, findStudent, projectOf, findPerson,
  sheetOf, setMark, submitSheet, rawTotalOf, toAssessorEntries,
} from '@/lib/data/store';

export const dynamic = 'force-dynamic';

type Component = 'p1' | 'p2';

/** One rejected cell: which student, which criterion, and why. */
type FieldError = { s: string; c: string; m: string };

function encodeErrors(errors: FieldError[]): string {
  // Capped so a pathological post cannot build an unusable URL.
  return encodeURIComponent(JSON.stringify(errors.slice(0, 25)));
}

function decodeErrors(raw: string | undefined): FieldError[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is FieldError =>
        typeof item === 'object' && item !== null &&
        typeof (item as FieldError).s === 'string' &&
        typeof (item as FieldError).m === 'string',
    );
  } catch { return []; }
}

async function saveMarks(formData: FormData) {
  'use server';
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');

  const component = String(formData.get('component')) as Component;
  const assigned = sessionsFor(component).flatMap((s) => s.studentIds);
  const errors: FieldError[] = [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('m:')) continue;
    const [, studentId, criterionId] = key.split(':');
    if (!studentId || !criterionId) continue;

    // Authorisation is re-checked per student on write, not just at page render.
    const decision = can(principal, 'presentation.grade', {
      memberId: studentId, assignedMemberIds: assigned,
    });
    if (!decision.allow) {
      errors.push({ s: studentId, c: criterionId, m: decision.reason });
      continue;
    }

    const raw = String(value).trim();
    const result = setMark(principal.userId, studentId, component, criterionId,
                           raw === '' ? null : Number(raw));
    // Every rejected cell is reported, not only the first. A save that stores
    // eighteen of twenty marks and names one problem teaches an assessor to
    // trust a save that partly failed.
    if (!result.ok) errors.push({ s: studentId, c: criterionId, m: result.error });
  }

  revalidatePath(`/grading/${component}`);
  redirect(
    errors.length
      ? `/grading/${component}?e=${encodeErrors(errors)}#sheet`
      : `/grading/${component}?saved=1#sheet`,
  );
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

  const fieldErrors = decodeErrors(e);
  const badField = new Set(fieldErrors.map((f) => `${f.s}:${f.c}`));

  // Rows are numbered across the whole sheet so keyboard movement can run down
  // a column through the session bands without losing its place.
  let rowIndex = -1;

  return (
    <>
      <h1 className="page">{rubric.title}</h1>
      <p className="lede">
        Your sheet covers {assigned.length} students across {sessions.length} sessions.
        Marks out of {rubric.max}; the total is computed, never typed.
      </p>

      <div className="page-context">
        {/* The columns below come from a versioned departmental form. Saying which
            version is on screen is what makes a mark defensible a year later. */}
        <span className="cycle-chip">form v{rubric.version}</span>
        <span className="cycle-chip">out of {rubric.max}</span>
        {principal.permissions.includes('config.edit') && (
          <a href="/rubrics" style={{ fontSize: 12.5 }}>Edit this form</a>
        )}
        <span className="rule-spacer" />
      </div>

      {saved && <div className="notice" role="status">Marks saved.</div>}
      {submitted && <div className="notice" role="status">Sheet submitted — {submitted} rows locked.</div>}
      {fieldErrors.length > 0 && (
        <div className="notice bad" role="alert">
          <strong>
            {fieldErrors.length} {fieldErrors.length === 1 ? 'mark was' : 'marks were'} not saved.
          </strong>
          <ul className="errorlist">
            {fieldErrors.map((f) => (
              <li key={`${f.s}:${f.c}`}>
                {findStudent(f.s)?.surname ?? f.s} — {f.m}
              </li>
            ))}
          </ul>
        </div>
      )}
      {locked && <div className="notice bad">This sheet is submitted. A coordinator must reopen it before you can change a mark.</div>}

      <form action={saveMarks} id="sheet-form">
        <input type="hidden" name="component" value={component} />
        {/* Sheets get printed and filed. On paper the screen furniture is
            noise and the one thing missing is who marked and when. */}
        <div className="print-only box">
          <strong>{rubric.title}</strong> — assessor {findPerson(principal.userId)?.fullName},
          printed {new Date().toISOString().slice(0, 10)}.
          <p>Signature ................................................</p>
        </div>
        <p className="scroll-hint" id="sheet">
          Scroll the sheet sideways for the remaining criteria. The student column stays in place.
        </p>
        <div className="table-wrap" tabIndex={0} role="region" aria-label={`${rubric.title} marking sheet`}>
          <table className="grid">
            <caption className="sr-only">
              {rubric.title}. One row per student, one column per criterion, each out of its
              stated maximum. A blank cell records that you did not assess that student.
            </caption>
            <thead>
              <tr>
                <th scope="col" style={{ width: 40 }}>S/No</th>
                <th scope="col" className="idcol" style={{ width: 92 }}>Student ID</th>
                <th scope="col" className="stud" style={{ width: 200 }}>Student</th>
                {rubric.criteria.map((c) => (
                  <th scope="col" key={c.id} className="num" style={{ width: 58 }}>
                    {c.label}<span className="max">{c.max}</span>
                  </th>
                ))}
                <th scope="col" className="num" style={{ width: 58 }}>Total<span className="max">{rubric.max}</span></th>
                <th scope="col" className="num" style={{ width: 78 }}>Normalised</th>
                <th scope="col" style={{ width: 96 }}>Panel</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((slot) => {
                const project = projectOf(slot.studentIds[0]!);
                return (
                  /* A bare fragment cannot carry a key: React warned on every
                     render and reconciled these rows by position. */
                  <Fragment key={`slot-${slot.serial}`}>
                    <tr className={slot.joint ? 'band' : 'band solo'}>
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
                      const who = `${student.surname}, ${student.otherNames}`;
                      rowIndex += 1;
                      const row = rowIndex;
                      return (
                        <tr key={id} id={`r-${id}`}>
                          <td className="mono idcol" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{student.studentNumber}</td>
                          <th scope="row" className="stud"
                              style={{ whiteSpace: 'nowrap', fontWeight: 400, textAlign: 'left' }}>
                            <strong>{student.surname}</strong>, {student.otherNames}
                          </th>
                          {rubric.criteria.map((c, col) => (
                            <td key={c.id} className="num" style={{ padding: 2 }}>
                              <input className="mark" name={`m:${id}:${c.id}`} inputMode="numeric"
                                     min={0} max={c.max} type="number" disabled={locked}
                                     data-row={row} data-col={col}
                                     aria-invalid={badField.has(`${id}:${c.id}`) || undefined}
                                     aria-label={`${who}, ${c.label}, out of ${c.max}`}
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
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Follows the assessor down the sheet instead of sitting forty rows below it. */}
        <div className="actionbar">
          <button className="btn" type="submit" disabled={locked}>Save marks</button>
          <span className="dirty" role="status">Unsaved marks</span>
          <span className="hint">
            {done} of {assigned.length} rows have marks. A row left blank is recorded as not
            assessed by you and excluded from the panel mean — never scored zero.
            <span className="muted"> Enter or ↓ moves down the column.</span>
          </span>
        </div>
      </form>

      <MarkGrid formId="sheet-form" />

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
