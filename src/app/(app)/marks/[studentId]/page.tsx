import { redirect, notFound } from 'next/navigation';
import { currentPrincipal } from '@/lib/auth/current';
import { computeFinalMark, aggregatePanel, PROFILE_A, PROFILE_B, normalisePercentage } from '@/lib/assessment';
import {
  findStudentByNumber, projectOf, docMarkOf, findPerson, findStudent,
  toConsultationRecords, toAssessorEntries, sheetsFor, rawTotalOf, RUBRICS,
} from '@/lib/data/store';

export const dynamic = 'force-dynamic';

export default async function MarkSheet({ params }: { params: Promise<{ studentId: string }> }) {
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');

  const { studentId } = await params;
  const student = findStudentByNumber(studentId);
  if (!student) notFound();

  const project = projectOf(student.id)!;
  if (!principal.roles.includes('COORDINATOR') && project.supervisorId !== principal.userId) {
    return <><h1 className="page">Not permitted</h1>
      <p className="lede">You are not the supervisor of record for this student.</p></>;
  }

  const doc = docMarkOf(student.id);
  const input = {
    studentId: student.id, cycleId: '2025/2026',
    consultations: toConsultationRecords(student.id),
    presentations: [
      { componentKey: 'p1', entries: toAssessorEntries(student.id, 'p1') },
      { componentKey: 'p2', entries: toAssessorEntries(student.id, 'p2') },
    ],
    ...(doc ? { documentation: {
      rawTotal: doc.rawTotal, rubricMax: doc.rubricMax, rubricVersionId: 'rv-doc-1',
      markedBy: doc.markedBy, ...(doc.agreedRawTotal !== null ? { agreedRawTotal: doc.agreedRawTotal } : {}),
    } } : {}),
    computedBy: principal.userId,
  };
  const a = computeFinalMark(input, PROFILE_A);
  const b = computeFinalMark(input, PROFILE_B);
  const co = project.memberIds.filter((m) => m !== student.id).map((m) => findStudent(m));

  return (
    <>
      <h1 className="page">{student.surname}, {student.otherNames} — {student.studentNumber}</h1>
      <p className="lede">{student.programme} · {student.courseCode} · supervised by {findPerson(project.supervisorId)?.fullName}<br />{project.title}</p>

      {co.length > 0 && (
        <div className="box">
          <strong>Joint project, {project.memberIds.length} members</strong>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Presented with {co.map((c) => `${c?.surname}, ${c?.otherNames}`).join('; ')}. The proposal,
            artefact and documentation are shared; consultations, contribution statements and every
            mark below belong to this student alone. Contribution statement:{' '}
            {project.contributionFiled[student.id] ? 'filed' : <strong>not filed</strong>}.
          </p>
        </div>
      )}

      <div className="box" style={{ borderLeftWidth: 4 }}>
        <span style={{ font: '700 40px/1 ui-serif,Georgia,serif', color: 'var(--seal)' }}>
          {a.finalMark ?? '—'}
        </span>
        <span className="muted" style={{ fontSize: 20 }}>%</span>
        <span style={{ font: '24px ui-serif,Georgia,serif', marginLeft: 14 }}>{a.grade ?? ''}</span>
        <div className="muted" style={{ marginTop: 8 }}>
          {a.blocked
            ? a.flags.filter((f) => f.blocking).map((f) => <span className="flag red" key={f.code}>{f.message}</span>)
            : 'No blocking flags. Awaiting coordinator release.'}
          {a.flags.filter((f) => !f.blocking).map((f) => <span className="flag amber" key={f.code}>{f.message}</span>)}
        </div>
      </div>

      <h2 style={{ fontSize: 15 }}>How the mark was reached</h2>
      <div className="table-wrap">
        <table className="list">
          <thead>
            <tr><th style={{ width: '34%' }}>Component</th><th style={{ width: '26%' }}>Working</th>
              <th className="num">Achieved</th><th className="num">Weight</th><th className="num">Points</th></tr>
          </thead>
          <tbody>
            {a.components.map((c) => {
              const periods = (c.detail as { periods?: Array<{ periodId: string; gradedCount: number; requiredCount: number; rawMean: number | null; complianceFactor: number; engagementBonus: number }> }).periods;
              return (
                <tr key={c.key}>
                  <td><strong>{c.label}</strong></td>
                  <td className="muted mono" style={{ fontSize: 11.5 }}>
                    {periods
                      ? periods.map((p) => `${p.periodId}: mean ${p.rawMean ?? '—'} × ${p.complianceFactor} + ${p.engagementBonus}`).join(' · ')
                      : `panel of ${(c.detail as { contributing?: string[] }).contributing?.length ?? 0}, spread ${(c.detail as { spread?: number | null }).spread ?? '—'}`}
                  </td>
                  <td className="num mono">{c.percentage === null ? '—' : `${c.percentage}%`}</td>
                  <td className="num mono">{c.weightPoints}</td>
                  <td className="num mono"><strong>{c.points ?? '—'}</strong></td>
                </tr>
              );
            })}
            <tr>
              <td><strong>Final documentation</strong></td>
              <td className="muted mono" style={{ fontSize: 11.5 }}>
                {doc ? `agreed ${doc.agreedRawTotal ?? doc.rawTotal} of ${doc.rubricMax}` : 'not marked'}
              </td>
              <td className="num mono">{a.documentationScore === null ? '—' : `${a.documentationScore}%`}</td>
              <td className="num mono">{PROFILE_A.documentationWeight}</td>
              <td className="num mono"><strong>{a.documentationPoints ?? '—'}</strong></td>
            </tr>
            <tr style={{ background: '#E4E8E1', fontWeight: 700 }}>
              <td>Final mark</td>
              <td className="muted mono" style={{ fontSize: 11.5 }}>
                {a.caPoints ?? '—'} + {a.documentationPoints ?? '—'}, half-up to 1 dp
              </td>
              <td className="num mono">CA {a.caScore ?? '—'}%</td>
              <td className="num mono">100</td>
              <td className="num mono">{a.finalMark ?? '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 15 }}>Presentation 2 — how the panel landed</h2>
      <div className="table-wrap">
        <table className="list">
          <thead><tr><th>Assessor</th><th className="num">Raw of {RUBRICS.p2.max}</th>
            <th className="num">Normalised</th><th>Status</th></tr></thead>
          <tbody>
            {sheetsFor(student.id, 'p2').map((s) => {
              const total = rawTotalOf(s);
              const counted = s.submitted && total !== null;
              return (
                <tr key={s.assessorId}>
                  <td>{findPerson(s.assessorId)?.fullName}
                    {projectOf(student.id)?.supervisorId === s.assessorId && <span className="muted"> (supervisor)</span>}</td>
                  <td className="num mono">{total ?? '—'}</td>
                  <td className="num mono">{total === null ? '—' : `${normalisePercentage(total, s.rubricMax).toFixed(1)}%`}</td>
                  <td style={{ fontSize: 11.5 }}>
                    {counted ? 'Counted' : <span className="chip warn">{s.submitted ? 'blank — excluded' : 'not submitted'}</span>}
                  </td>
                </tr>
              );
            })}
            {(() => {
              const p = aggregatePanel(toAssessorEntries(student.id, 'p2'), PROFILE_A.panel);
              return (
                <tr style={{ background: '#F4F6F2', fontWeight: 700 }}>
                  <td>Panel — {p.contributingAssessorIds.length} contributing</td>
                  <td className="num">—</td>
                  <td className="num mono">{p.percentage === null ? '—' : `${p.percentage}%`}</td>
                  <td style={{ fontSize: 11.5 }}>spread {p.spread ?? '—'} · {p.status.replaceAll('_', ' ').toLowerCase()}</td>
                </tr>
              );
            })()}
          </tbody>
        </table>
      </div>

      <div className="box" style={{ marginTop: 16 }}>
        <strong>Under the legacy 2022 profile this student would score {b.finalMark ?? '—'}%</strong>
        <p className="muted" style={{ margin: '6px 0 0' }}>
          Same inputs, presentations weighted 30/70 and consultations acting as a gate rather than a
          mark. The difference is {a.finalMark !== null && b.finalMark !== null
            ? `${Math.abs(Math.round((a.finalMark - b.finalMark) * 10) / 10)} marks` : 'not computable yet'}.
          Which profile applies is a departmental decision, not a system one.
        </p>
      </div>

      <p className="muted" style={{ fontSize: 11.5, marginTop: 14 }}>
        Config {a.configId} · rubrics {a.rubricVersionIds.join(', ')} · consultation policy{' '}
        {a.policies.consultation} · panel {a.policies.panel} · rounding {a.policies.rounding} ·
        computed {a.computedAt}
      </p>
    </>
  );
}
