import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/lib/auth/current';
import { can } from '@/lib/rbac/policy';
import { computeFinalMark, aggregatePanel, PROFILE_A } from '@/lib/assessment';
import {
  allocatedStudents, projectOf, docMarkOf, findPerson, toConsultationRecords, toAssessorEntries,
  publicationOf, publish, recordModeration, moderationOf, findStudent,
} from '@/lib/data/store';

export const dynamic = 'force-dynamic';

function snapshotFor(studentId: string, computedBy: string) {
  const doc = docMarkOf(studentId);
  const mod = (c: 'p1' | 'p2') => {
    const m = moderationOf(studentId, c);
    return m ? { moderation: { moderatorId: m.moderatorId, rationale: m.rationale,
                               agreedPercentage: m.agreedPercentage, moderatedAt: m.moderatedAt } } : {};
  };
  return computeFinalMark({
    studentId, cycleId: '2025/2026',
    consultations: toConsultationRecords(studentId),
    presentations: [
      { componentKey: 'p1', entries: toAssessorEntries(studentId, 'p1'), ...mod('p1') },
      { componentKey: 'p2', entries: toAssessorEntries(studentId, 'p2'), ...mod('p2') },
    ],
    ...(doc ? { documentation: {
      rawTotal: doc.rawTotal, rubricMax: doc.rubricMax, rubricVersionId: 'rv-doc-1',
      markedBy: doc.markedBy, ...(doc.agreedRawTotal !== null ? { agreedRawTotal: doc.agreedRawTotal } : {}),
    } } : {}),
    computedBy,
  }, PROFILE_A);
}

async function moderate(formData: FormData) {
  'use server';
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');
  const studentId = String(formData.get('studentId'));
  const component = String(formData.get('component')) as 'p1' | 'p2';
  const originating = String(formData.get('originatingMarkerId'));

  const decision = can(principal, 'presentation.moderate', { originatingMarkerId: originating });
  if (!decision.allow) redirect(`/publish?e=${encodeURIComponent(decision.reason)}`);

  const result = recordModeration(studentId, component, principal.userId,
                                  Number(formData.get('agreed')), String(formData.get('rationale') ?? ''));
  redirect(`/publish?${result.ok ? 'saved=1' : `e=${encodeURIComponent(result.error)}`}`);
}

async function release(formData: FormData) {
  'use server';
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');
  const studentId = String(formData.get('studentId'));
  const doc = docMarkOf(studentId);

  // Separation of duty: whoever awarded a component may not release it.
  const decision = can(principal, 'mark.publish',
    doc ? { originatingMarkerId: doc.markedBy } : {});
  if (!decision.allow) redirect(`/publish?e=${encodeURIComponent(decision.reason)}`);

  const snap = snapshotFor(studentId, principal.userId);
  if (snap.blocked) redirect('/publish?e=A+blocked+mark+cannot+be+released.');
  publish(studentId, snap.finalMark, snap.grade, principal.userId, null);
  redirect('/publish?saved=1');
}

export default async function Publish({
  searchParams,
}: { searchParams: Promise<{ saved?: string; e?: string }> }) {
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');
  if (!principal.roles.includes('COORDINATOR')) {
    return <><h1 className="page">Not permitted</h1>
      <p className="lede">Releasing results is a coordinator action.</p></>;
  }
  const { saved, e } = await searchParams;

  const rows = allocatedStudents().map((s) => ({ student: s, snap: snapshotFor(s.id, principal.userId),
                                      published: publicationOf(s.id) }));
  const needsModeration = rows.flatMap(({ student }) =>
    (['p1', 'p2'] as const).map((c) => {
      const panel = aggregatePanel(toAssessorEntries(student.id, c), PROFILE_A.panel);
      return panel.status === 'MODERATION_REQUIRED' ? { student, component: c, panel } : null;
    }).filter((x) => x !== null));

  const ready = rows.filter((r) => !r.snap.blocked && !r.published).length;

  return (
    <>
      <h1 className="page">Release results</h1>
      <p className="lede">
        {ready} of {rows.length} ready to release · {needsModeration.length} awaiting moderation ·{' '}
        {rows.filter((r) => r.published).length} already released.
      </p>

      {saved && <div className="notice">Done.</div>}
      {e && <div className="notice bad">{e}</div>}

      {needsModeration.length > 0 && (
        <>
          <h2 style={{ fontSize: 15 }}>Moderation queue</h2>
          {needsModeration.map((m) => {
            const entries = toAssessorEntries(m.student.id, m.component);
            const doc = docMarkOf(m.student.id);
            return (
              <div className="box" key={`${m.student.id}-${m.component}`} style={{ borderLeftColor: 'var(--pen)' }}>
                <strong>{m.student.surname}, {m.student.otherNames}</strong> — {m.component.toUpperCase()},
                assessor spread {m.panel.spread} exceeds the {PROFILE_A.panel.discrepancyThreshold}-point threshold.
                <p className="muted mono" style={{ margin: '6px 0', fontSize: 11.5 }}>
                  {entries.filter((x) => x.submitted).map((x) => {
                    const t = Object.values(x.criterionScores).filter((v): v is number => v !== null)
                      .reduce((a, b) => a + b, 0);
                    return `${findPerson(x.assessorId)?.surname}: ${t}/${x.rubricMax}`;
                  }).join(' · ')}
                </p>
                <form action={moderate}>
                  <input type="hidden" name="studentId" value={m.student.id} />
                  <input type="hidden" name="component" value={m.component} />
                  <input type="hidden" name="originatingMarkerId" value={doc?.markedBy ?? ''} />
                  <input name="agreed" type="number" min={0} max={100} step="0.1" placeholder="agreed %"
                         style={{ width: 100, padding: 6 }} required />{' '}
                  <input name="rationale" placeholder="Why — recorded against your name" required
                         style={{ width: 420, padding: 6 }} />{' '}
                  <button className="btn" type="submit">Record moderation</button>
                </form>
              </div>
            );
          })}
        </>
      )}

      <h2 style={{ fontSize: 15 }}>Cohort</h2>
      <table className="list">
        <thead>
          <tr>
            <th style={{ width: '24%' }}>Student</th>
            <th className="num" style={{ width: '8%' }}>CA</th>
            <th className="num" style={{ width: '8%' }}>Final</th>
            <th style={{ width: '36%' }}>Standing</th>
            <th style={{ width: '24%' }}>Release</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ student, snap, published }) => {
            const doc = docMarkOf(student.id);
            const sod = can(principal, 'mark.publish', doc ? { originatingMarkerId: doc.markedBy } : {});
            return (
              <tr key={student.id}>
                <td>
                  <strong>{student.surname}, {student.otherNames}</strong>
                  <div className="muted mono" style={{ fontSize: 11 }}>{student.studentNumber} · {student.programme}</div>
                </td>
                <td className="num mono">{snap.caScore ?? '—'}</td>
                <td className="num mono"><strong>{snap.finalMark ?? '—'}</strong> {snap.grade ?? ''}</td>
                <td>
                  {snap.flags.length === 0 && <span className="flag ok">No flags.</span>}
                  {snap.flags.map((f) => (
                    <span className={f.blocking ? 'flag red' : 'flag amber'} key={f.code}>{f.message}</span>
                  ))}
                </td>
                <td>
                  {published
                    ? <><span className="chip ok">released {published.publishedAt.slice(0, 10)}</span>
                        <div className="muted" style={{ fontSize: 11 }}>
                          by {findPerson(published.publishedBy)?.fullName}
                        </div></>
                    : snap.blocked
                      ? <span className="muted" style={{ fontSize: 12 }}>blocked</span>
                      : !sod.allow
                        ? <span className="chip bad" title={sod.reason}>separation of duty</span>
                        : <form action={release}>
                            <input type="hidden" name="studentId" value={student.id} />
                            <button className="btn" style={{ padding: '5px 12px', fontSize: 12 }}>Release</button>
                          </form>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="box" style={{ marginTop: 14 }}>
        <strong>Releasing is a separate act from marking.</strong>
        <p className="muted" style={{ margin: '6px 0 0' }}>
          Whoever awarded a component cannot release it, and a blocked mark cannot be released at
          all. A released mark is never edited: a correction writes a new record that supersedes the
          old one, and both stay retrievable. Students see their result only after release.
        </p>
      </div>
    </>
  );
}
