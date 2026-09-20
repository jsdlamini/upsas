import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/lib/auth/current';
import { can } from '@/lib/rbac/policy';
import { evaluateConsultations, computeFinalMark, PROFILE_A, normalisePercentage } from '@/lib/assessment';
import {
  findPerson, findStudent, projectOf, consultationsOf, toConsultationRecords,
  attestConsultation, publicationOf, findStudentByNumber, docMarkOf, toAssessorEntries,
} from '@/lib/data/store';

export const dynamic = 'force-dynamic';

async function attest(formData: FormData) {
  'use server';
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');
  const decision = can(principal, 'consultation.attest');
  if (!decision.allow) redirect(`/me?e=${encodeURIComponent(decision.reason)}`);

  // A student may attest only their own session.
  const person = findPerson(principal.userId);
  const id = String(formData.get('id'));
  if (!person?.studentId || !consultationsOf(person.studentId).some((c) => c.id === id)) {
    redirect('/me?e=That+session+is+not+yours+to+confirm.');
  }
  attestConsultation(id, 'STUDENT');
  redirect('/me?saved=1');
}

function snapshotFor(studentId: string) {
  const doc = docMarkOf(studentId);
  return computeFinalMark({
    studentId, cycleId: '2025/2026',
    consultations: toConsultationRecords(studentId),
    presentations: [
      { componentKey: 'p1', entries: toAssessorEntries(studentId, 'p1') },
      { componentKey: 'p2', entries: toAssessorEntries(studentId, 'p2') },
    ],
    ...(doc ? { documentation: {
      rawTotal: doc.rawTotal, rubricMax: doc.rubricMax, rubricVersionId: 'rv-doc-1',
      markedBy: doc.markedBy, ...(doc.agreedRawTotal !== null ? { agreedRawTotal: doc.agreedRawTotal } : {}),
    } } : {}),
    computedBy: 'student-dashboard',
  }, PROFILE_A);
}

export default async function MyProject({
  searchParams,
}: { searchParams: Promise<{ saved?: string; e?: string }> }) {
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');
  const { saved, e } = await searchParams;

  const person = findPerson(principal.userId);
  const student = person?.studentId
    ? findStudent(person.studentId)
    : findStudentByNumber(person?.username ?? '');
  if (!student) {
    return <><h1 className="page">My dashboard</h1>
      <p className="lede">This page is for students. Your account is not linked to a student record.</p></>;
  }

  const project = projectOf(student.id);
  const rows = consultationsOf(student.id);
  const outcome = evaluateConsultations(toConsultationRecords(student.id), PROFILE_A.consultation);
  const published = publicationOf(student.id);
  const snapshot = published ? snapshotFor(student.id) : null;
  const p1pct = snapshot?.components.find((c) => c.key === 'p1')?.percentage ?? null;
  const p2pct = snapshot?.components.find((c) => c.key === 'p2')?.percentage ?? null;
  const awaiting = rows.filter((c) => c.status === 'COMPLETED' && c.supervisorAttested && !c.studentAttested);

  return (
    <>
      <h1 className="page">My dashboard</h1>
      <p className="lede">
        {student.surname}, {student.otherNames} — {student.studentNumber} · {student.programme} · {student.courseCode}<br />
        {project
          ? project.title
          : <em>No project yet — choose a topic and wait for allocation.</em>}
        {project && project.memberIds.length > 1 && ` · joint project with ${project.memberIds
          .filter((m) => m !== student.id).map((m) => findStudent(m)?.surname).join(', ')}`}
      </p>

      {saved && <div className="notice">Confirmed.</div>}
      {e && <div className="notice bad">{e}</div>}

      {!project && (
        <div className="box" style={{ borderLeftColor: 'var(--accent)' }}>
          <strong>You are not allocated to a project yet.</strong>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Once you are allocated, your supervisor, consultation marks and results will appear here.
            <a href="/topics" style={{ marginLeft: 6 }}>Browse topics and rank your choices →</a>
          </p>
        </div>
      )}

      {awaiting.length > 0 && (
        <div className="box" style={{ borderLeftColor: 'var(--caution)' }}>
          <strong>{awaiting.length} session{awaiting.length > 1 ? 's' : ''} waiting for your confirmation</strong>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            A session counts toward your minimum only once both you and your supervisor confirm it
            happened. Confirming is your half of the register — nobody can do it for you.
          </p>
        </div>
      )}

      {published && snapshot && (
        <div className="box">
          <strong>My marks</strong>
          <p className="muted" style={{ margin: '6px 0 12px' }}>
            Released results. Each figure comes from the stored snapshot, so it matches what the
            department files.
          </p>
          <div className="marks-grid">
            <div className="mark-cell">
              <span className="mark-label">Presentation 1</span>
              <span className="mark-value">{p1pct !== null ? `${p1pct.toFixed(1)}%` : '—'}</span>
            </div>
            <div className="mark-cell">
              <span className="mark-label">Presentation 2</span>
              <span className="mark-value">{p2pct !== null ? `${p2pct.toFixed(1)}%` : '—'}</span>
            </div>
            <div className="mark-cell">
              <span className="mark-label">Coursework (CA)</span>
              <span className="mark-value">{snapshot.caScore !== null ? `${snapshot.caScore.toFixed(1)}%` : '—'}</span>
            </div>
            <div className="mark-cell final">
              <span className="mark-label">Final mark</span>
              <span className="mark-value">
                {published.finalMark !== null ? published.finalMark : '—'}
                {published.grade && <span className="grade-pill">{published.grade}</span>}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="box">
        <strong>Where my consultation mark stands</strong>
        <div className="progress" style={{ marginTop: 12 }}>
          {outcome.periods.map((p) => (
            <div className="progress-row" key={p.periodId}>
              <span className="progress-label">{p.periodId}</span>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${Math.min(100, Math.round((p.gradedCount / p.requiredCount) * 100))}%` }} />
              </div>
              <span className="progress-count">{p.gradedCount} of {p.requiredCount}</span>
            </div>
          ))}
        </div>
        <table className="list" style={{ marginTop: 10 }}>
          <thead>
            <tr><th>Period</th><th className="num">Counted</th><th className="num">Required</th>
              <th className="num">Average</th><th className="num">Period score</th><th>Standing</th></tr>
          </thead>
          <tbody>
            {outcome.periods.map((p) => (
              <tr key={p.periodId}>
                <td>{p.periodId}</td>
                <td className="num mono">{p.gradedCount}</td>
                <td className="num mono">{p.requiredCount}</td>
                <td className="num mono">{p.rawMean === null ? '—' : p.rawMean.toFixed(1)}</td>
                <td className="num mono"><strong>{p.score ?? '—'}</strong></td>
                <td style={{ fontSize: 11.5 }}>
                  {p.gateMet
                    ? <span className="chip ok">minimum met</span>
                    : <span className="chip warn">
                        {p.requiredCount - p.gradedCount} more needed — your average is
                        scaled to {p.complianceFactor} until then
                      </span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 15 }}>My consultation register</h2>
      <table className="list">
        <thead>
          <tr><th style={{ width: 90 }}>Held</th><th style={{ width: 60 }}>Period</th><th>What was reviewed</th>
            <th style={{ width: 110 }}>Status</th><th style={{ width: 170 }}>Confirmation</th>
            <th style={{ width: 90 }} className="num">Mark</th></tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td className="mono" style={{ fontSize: 11 }}>{c.heldAt.slice(0, 10)}</td>
              <td>{c.periodId}</td>
              <td>{c.agenda}</td>
              <td style={{ fontSize: 11.5 }}>{c.status.replaceAll('_', ' ').toLowerCase()}</td>
              <td style={{ fontSize: 11.5 }}>
                {c.supervisorAttested ? <span className="chip ok">supervisor</span> : <span className="chip">supervisor pending</span>}
                {c.studentAttested
                  ? <span className="chip ok">you</span>
                  : c.status === 'COMPLETED'
                    ? <form action={attest} style={{ display: 'inline' }}>
                        <input type="hidden" name="id" value={c.id} />
                        <button className="btn" style={{ padding: '2px 10px', fontSize: 11 }}>Confirm</button>
                      </form>
                    : <span className="chip">n/a</span>}
              </td>
              <td className="num mono">
                {c.rawTotal === null ? '—' : `${normalisePercentage(c.rawTotal, c.rubricMax).toFixed(0)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ fontSize: 15 }}>My result</h2>
      {published ? (
        <div className="box">
          <span style={{ font: '700 34px/1 ui-serif,Georgia,serif', color: 'var(--seal)' }}>
            {published.finalMark}
          </span>
          <span className="muted" style={{ fontSize: 18 }}>%</span>
          <span style={{ font: '22px ui-serif,Georgia,serif', marginLeft: 14 }}>{published.grade}</span>
          <p className="muted" style={{ margin: '8px 0 0' }}>
            Released {published.publishedAt.slice(0, 10)}.{' '}
            {published.supersedes && `This supersedes an earlier result: ${published.reason}`}
          </p>
        </div>
      ) : (
        <div className="box" style={{ borderLeftColor: 'var(--muted)' }}>
          <strong>Not released yet</strong>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Your final mark appears here once the coordinator releases results. Marks in progress are
            not shown, because they can still change.
          </p>
        </div>
      )}
    </>
  );
}
