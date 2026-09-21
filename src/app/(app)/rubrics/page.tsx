import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { currentPrincipal } from '@/lib/auth/current';
import { can } from '@/lib/rbac/policy';
import {
  activeInstrument, instrumentHistory, findPerson,
  previewInstrumentEdit, applyInstrumentEdit, instrumentInUse,
  readPendingEdit, writePendingEdit, clearPendingEdit,
} from '@/lib/data/store';
import type { Draft, DraftCriterion } from '@/lib/rubrics/instrument';

export const dynamic = 'force-dynamic';

type Component = 'p1' | 'p2';

function componentOf(value: string | undefined): Component {
  return value === 'p1' ? 'p1' : 'p2';
}

/**
 * Read the editing form back into a draft.
 *
 * Rows are keyed by criterion id, or `new-N` for a column being added. The
 * position field is what lets a coordinator reorder columns without dragging,
 * which keeps the screen working with no JavaScript.
 */
function draftFromForm(formData: FormData): Draft {
  const rows: Array<{ id: string | null; label: string; max: number; remove: boolean; pos: number }> = [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('label:')) continue;
    const ref = key.slice('label:'.length);
    const label = String(value).trim();
    const isNew = ref.startsWith('new-');
    // An untouched blank "add a column" row is not an empty column, it is
    // nothing at all, so it never reaches validation.
    if (isNew && !label) continue;
    rows.push({
      id: isNew ? null : ref,
      label,
      max: Number(String(formData.get(`max:${ref}`) ?? '0').trim()),
      remove: formData.get(`remove:${ref}`) === 'on',
      pos: Number(String(formData.get(`pos:${ref}`) ?? '999')),
    });
  }

  rows.sort((a, b) => a.pos - b.pos);
  return {
    title: String(formData.get('title') ?? '').trim(),
    note: String(formData.get('note') ?? '').trim(),
    criteria: rows.map(({ id, label, max, remove }) => ({ id, label, max, remove })),
  };
}

async function review(formData: FormData) {
  'use server';
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');
  const decision = can(principal, 'config.edit', {});
  if (!decision.allow) redirect('/rubrics?e=' + encodeURIComponent(decision.reason));

  const component = componentOf(String(formData.get('component')));
  const draft = draftFromForm(formData);
  const result = previewInstrumentEdit(component, draft, principal.userId);

  if (!result.ok) {
    writePendingEdit(principal.userId, component, draft);
    redirect(`/rubrics?c=${component}&e=${encodeURIComponent(JSON.stringify(result.errors.slice(0, 8)))}`);
  }

  writePendingEdit(principal.userId, component, draft);
  redirect(`/rubrics?c=${component}&review=1`);
}

async function apply(formData: FormData) {
  'use server';
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');
  const decision = can(principal, 'config.edit', {});
  if (!decision.allow) redirect('/rubrics?e=' + encodeURIComponent(decision.reason));

  const component = componentOf(String(formData.get('component')));
  const pending = readPendingEdit(principal.userId, component);
  if (!pending) redirect(`/rubrics?c=${component}&e=${encodeURIComponent('["That change expired. Make it again."]')}`);

  const result = applyInstrumentEdit(component, pending, principal.userId, true);
  if (!result.ok) {
    redirect(`/rubrics?c=${component}&e=${encodeURIComponent(JSON.stringify(result.errors.slice(0, 8)))}`);
  }

  clearPendingEdit(principal.userId, component);
  revalidatePath('/rubrics');
  revalidatePath(`/grading/${component}`);
  redirect(`/rubrics?c=${component}&done=${encodeURIComponent(result.applied.summary)}`);
}

async function discard(formData: FormData) {
  'use server';
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');
  const component = componentOf(String(formData.get('component')));
  clearPendingEdit(principal.userId, component);
  redirect(`/rubrics?c=${component}`);
}

export default async function Rubrics({
  searchParams,
}: { searchParams: Promise<{ c?: string; review?: string; e?: string; done?: string }> }) {
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');

  const gate = can(principal, 'config.edit', {});
  if (!gate.allow) {
    return (
      <>
        <h1 className="page">Not permitted</h1>
        <p className="lede">{gate.reason} Assessment forms are maintained by the project coordinator.</p>
      </>
    );
  }

  const { c, review: reviewing, e, done } = await searchParams;
  const component = componentOf(c);
  const current = activeInstrument(component);
  const history = instrumentHistory(component);
  const inUse = instrumentInUse(component);

  let errors: string[] = [];
  if (e) { try { const parsed: unknown = JSON.parse(e); if (Array.isArray(parsed)) errors = parsed.map(String); } catch { errors = [e]; } }

  const pending = readPendingEdit(principal.userId, component);
  const plan = reviewing && pending
    ? previewInstrumentEdit(component, pending, principal.userId)
    : null;

  // The form is filled from a pending draft if one is waiting, so a rejected
  // change comes back with the coordinator's own wording rather than the
  // original, which would quietly throw away their work.
  const rows: Array<DraftCriterion & { key: string }> = (pending?.criteria ?? current.criteria.map(
    (cr) => ({ id: cr.id, label: cr.label, max: cr.max, remove: false }),
  )).map((cr, i) => ({ ...cr, key: cr.id ?? `new-${i}` }));

  const total = rows.filter((r) => !r.remove).reduce((sum, r) => sum + (Number(r.max) || 0), 0);

  return (
    <>
      <h1 className="page">Assessment forms</h1>
      <p className="lede">
        The columns of a marking sheet, and what each is worth. Change them here rather than in
        code. A mark is only meaningful alongside the form it was awarded under, so a form that
        has been used is never rewritten: editing it creates a new version and leaves signed
        sheets on the old one.
      </p>

      <div className="tabs-switch">
        <a href="/rubrics?c=p1" className={component === 'p1' ? 'on' : undefined}>Presentation 1</a>
        <a href="/rubrics?c=p2" className={component === 'p2' ? 'on' : undefined}>Presentation 2</a>
      </div>

      {done && <div className="notice" role="status">Form updated — {done}.</div>}
      {errors.length > 0 && (
        <div className="notice bad" role="alert">
          <strong>This change was not applied.</strong>
          <ul className="errorlist">{errors.map((msg) => <li key={msg}>{msg}</li>)}</ul>
        </div>
      )}

      <div className="page-context">
        <span className="cycle-chip">version {current.version}</span>
        <span className="cycle-chip">out of {current.max}</span>
        <span className="cycle-chip">
          {inUse ? 'in use — edits create a new version' : 'not yet marked on — edits apply in place'}
        </span>
        <span className="rule-spacer" />
      </div>

      {plan?.ok && (
        <div className="box" role="region" aria-label="What this change does">
          <h2 style={{ marginTop: 0 }}>Before you commit</h2>
          <p>
            {plan.plan.mode === 'fork'
              ? <>This creates <strong>version {plan.plan.next.version}</strong>. Version {current.version} stays
                  attached to every sheet already signed under it.</>
              : <>Nothing has been marked on this form yet, so the change applies to
                  <strong> version {current.version}</strong> in place.</>}
          </p>
          <ul className="errorlist">
            {plan.plan.added.length > 0 && <li>Adds {plan.plan.added.join(', ')}.</li>}
            {plan.plan.removed.length > 0 && <li>Removes {plan.plan.removed.join(', ')}.</li>}
            {plan.plan.renamed.map((r) => <li key={r.to}>Renames {r.from} to {r.to}. Marks already entered under it are kept.</li>)}
            {plan.plan.rescaled.map((r) => <li key={r.label}>{r.label} changes from {r.from} marks to {r.to}.</li>)}
            <li>Sheet total {plan.plan.maxBefore} → <strong>{plan.plan.maxAfter}</strong>.</li>
            {plan.plan.sheetsMigrated > 0 && <li>{plan.plan.sheetsMigrated} open sheets move to the new version.</li>}
            {plan.plan.sheetsFrozen > 0 && <li>{plan.plan.sheetsFrozen} signed sheets stay on version {current.version}.</li>}
          </ul>

          {plan.plan.marksCleared.length > 0 && (
            <div className="notice bad" style={{ marginTop: 12 }}>
              <strong>{plan.plan.marksCleared.length} marks no longer fit and will be blanked.</strong>
              <ul className="errorlist">
                {plan.plan.marksCleared.slice(0, 8).map((m) => (
                  <li key={`${m.studentId}-${m.criterionId}-${m.assessorId}`}>
                    {findPerson(m.assessorId)?.surname ?? m.assessorId} gave {m.was} for {m.label};
                    {m.newMax === 0 ? ' that column is going.' : ` the column is now out of ${m.newMax}.`}
                    {' '}The row becomes blank, not zero, and is excluded from the panel until it is marked again.
                  </li>
                ))}
              </ul>
            </div>
          )}

          {plan.plan.splitPanels.length > 0 && (
            <div className="notice bad" style={{ marginTop: 12 }}>
              <strong>{plan.plan.splitPanels.length} students would be assessed on two different forms.</strong>
              <p style={{ margin: '6px 0 0' }}>
                One assessor has signed under version {current.version} and another has not yet marked.
                Each score still normalises against its own total, so the arithmetic holds — but whether
                a panel may span two forms is an academic decision, not a technical one.
              </p>
            </div>
          )}

          <div className="actionbar" style={{ position: 'static', marginTop: 14 }}>
            <form action={apply}>
              <input type="hidden" name="component" value={component} />
              <button className="btn" type="submit">
                {plan.plan.mode === 'fork' ? `Publish version ${plan.plan.next.version}` : 'Save changes'}
              </button>
            </form>
            <form action={discard}>
              <input type="hidden" name="component" value={component} />
              <button className="btn ghost" type="submit">Keep editing</button>
            </form>
            <span className="hint">Recorded against {findPerson(principal.userId)?.fullName} with your reason.</span>
          </div>
        </div>
      )}

      <form action={review}>
        <input type="hidden" name="component" value={component} />

        <h2>Sheet heading</h2>
        <p>
          <label className="field-label" htmlFor="title">Title shown above the sheet</label>
          <input id="title" name="title" type="text" defaultValue={pending?.title ?? current.title}
                 style={{ width: '100%', maxWidth: 560 }} required />
        </p>

        <h2>Columns</h2>
        <p className="scroll-hint">Scroll sideways for the position and removal controls.</p>
        <div className="table-wrap">
          <table className="list">
            <caption className="sr-only">
              Each row is one column of the marking sheet: its heading, what it is worth, and where
              it sits. Removing a row takes the column off future sheets; marks already awarded
              under it stay attached to the version they were awarded on.
            </caption>
            <thead>
              <tr>
                <th scope="col" style={{ width: 70 }}>Position</th>
                <th scope="col">Column heading</th>
                <th scope="col" className="num" style={{ width: 90 }}>Marks</th>
                <th scope="col" style={{ width: 90 }}>Remove</th>
                <th scope="col" style={{ width: 130 }}>Reference</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.key}>
                  <td>
                    <input className="mark" name={`pos:${row.key}`} type="number" min={1} max={99}
                           defaultValue={i + 1} aria-label={`Position of ${row.label || 'new column'}`} />
                  </td>
                  <td>
                    <input name={`label:${row.key}`} type="text" defaultValue={row.label}
                           style={{ width: '100%' }} maxLength={80}
                           aria-label={`Heading of column ${i + 1}`} />
                  </td>
                  <td className="num">
                    <input className="mark" name={`max:${row.key}`} type="number" min={1} max={100}
                           defaultValue={row.max} aria-label={`Marks for ${row.label || 'new column'}`} />
                  </td>
                  <td>
                    <label className="role-check" style={{ padding: '6px 10px' }}>
                      <input type="checkbox" name={`remove:${row.key}`} defaultChecked={row.remove} />
                      <span className="sr-only">Remove {row.label || `column ${i + 1}`}</span>
                    </label>
                  </td>
                  <td className="mono muted">{row.id ?? 'new'}</td>
                </tr>
              ))}

              {/* Two blank rows: adding a column is typing in one, not finding a button. */}
              {[0, 1].map((n) => {
                const key = `new-${rows.length + n}`;
                return (
                  <tr key={key}>
                    <td>
                      <input className="mark" name={`pos:${key}`} type="number" min={1} max={99}
                             defaultValue={rows.length + n + 1} aria-label={`Position of new column ${n + 1}`} />
                    </td>
                    <td>
                      <input name={`label:${key}`} type="text" placeholder="Add a column…"
                             style={{ width: '100%' }} maxLength={80}
                             aria-label={`Heading of new column ${n + 1}`} />
                    </td>
                    <td className="num">
                      <input className="mark" name={`max:${key}`} type="number" min={1} max={100}
                             placeholder="0" aria-label={`Marks for new column ${n + 1}`} />
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>—</td>
                    <td className="mono muted">new</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}><strong>Sheet total</strong></td>
                <td className="total">{total}</td>
                <td colSpan={2} className="muted" style={{ fontSize: 12 }}>
                  Computed from the columns. A sheet maximum is never typed.
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <h2>Reason for the change</h2>
        <p>
          <label className="field-label" htmlFor="note">
            A sentence, kept with the version and shown to anyone auditing a mark
          </label>
          <textarea id="note" name="note" rows={3} defaultValue={pending?.note ?? ''}
                    style={{ width: '100%', maxWidth: 640 }}
                    placeholder="e.g. Board of Examiners asked for references to be split from in-text citation." />
        </p>

        <div className="actionbar">
          <button className="btn" type="submit">Review this change</button>
          <span className="hint">
            Nothing is written until you have seen what the change does to marks already entered.
          </span>
        </div>
      </form>

      <h2>Version history</h2>
      <div className="table-wrap">
        <table className="list">
          <thead>
            <tr>
              <th scope="col" style={{ width: 70 }}>Version</th>
              <th scope="col" style={{ width: 90 }}>Out of</th>
              <th scope="col" style={{ width: 70 }}>Columns</th>
              <th scope="col" style={{ width: 130 }}>Created</th>
              <th scope="col" style={{ width: 150 }}>By</th>
              <th scope="col">Reason</th>
            </tr>
          </thead>
          <tbody>
            {history.map((version) => (
              <tr key={version.versionId}>
                <td>
                  <strong>v{version.version}</strong>{' '}
                  {version.supersededBy === null
                    ? <span className="chip ok">in force</span>
                    : <span className="chip">superseded</span>}
                </td>
                <td className="num">{version.max}</td>
                <td className="num">{version.criteria.length}</td>
                <td className="muted">{version.createdAt.slice(0, 10)}</td>
                <td className="muted">{version.createdBy ? findPerson(version.createdBy)?.fullName ?? version.createdBy : 'Departmental form'}</td>
                <td className="muted">{version.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
