import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { currentPrincipal } from '@/lib/auth/current';
import { can } from '@/lib/rbac/policy';
import { evaluateConsultations, PROFILE_A, normalisePercentage } from '@/lib/assessment';
import {
  STUDENTS, superviseesOf, projectOf, consultationsOf, findStudent,
  toConsultationRecords, gradeConsultation, attestConsultation, addConsultation,
} from '@/lib/data/store';

export const dynamic = 'force-dynamic';

async function grade(formData: FormData) {
  'use server';
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');
  const id = String(formData.get('id'));
  const studentId = String(formData.get('studentId'));
  const supervisorId = projectOf(studentId)?.supervisorId;
  const decision = can(principal, 'consultation.grade', supervisorId ? { supervisorId } : {});
  if (!decision.allow) redirect(`/consultations?e=${encodeURIComponent(decision.reason)}`);

  const raw = String(formData.get('rawTotal')).trim();
  const result = gradeConsultation(id, raw === '' ? null : Number(raw), principal.userId);
  redirect(`/consultations?${result.ok ? 'saved=1' : `e=${encodeURIComponent(result.error)}`}`);
}

async function attest(formData: FormData) {
  'use server';
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');
  const decision = can(principal, 'consultation.attest');
  if (!decision.allow) redirect(`/consultations?e=${encodeURIComponent(decision.reason)}`);
  attestConsultation(String(formData.get('id')), 'SUPERVISOR');
  revalidatePath('/consultations');
  redirect('/consultations?saved=1');
}

async function addSession(formData: FormData) {
  'use server';
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');
  const studentId = String(formData.get('studentId'));
  const supervisorId = projectOf(studentId)?.supervisorId;
  const decision = can(principal, 'consultation.grade', supervisorId ? { supervisorId } : {});
  if (!decision.allow) redirect(`/consultations?e=${encodeURIComponent(decision.reason)}`);
  addConsultation(studentId, String(formData.get('periodId')) as 'SEM1' | 'SEM2',
                  String(formData.get('agenda')) || 'Consultation');
  redirect('/consultations?saved=1');
}

export default async function Consultations({
  searchParams,
}: { searchParams: Promise<{ saved?: string; e?: string; student?: string }> }) {
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');
  const { saved, e, student } = await searchParams;

  const mine = principal.roles.includes('COORDINATOR') ? STUDENTS : superviseesOf(principal.userId);
  const selected = (student ? findStudent(student) : null) ?? mine[0];
  if (!selected) return <><h1 className="page">Consultations</h1><p className="lede">No supervisees.</p></>;

  const rows = consultationsOf(selected.id);
  const outcome = evaluateConsultations(toConsultationRecords(selected.id), PROFILE_A.consultation);

  return (
    <>
      <h1 className="page">Consultation register</h1>
      <p className="lede">
        Replaces the signed paper register. Both parties attest; no-shows are recorded but never
        scored zero. Only attested, graded sessions count toward the minimum.
      </p>

      {saved && <div className="notice">Saved.</div>}
      {e && <div className="notice bad">{e}</div>}

      <p style={{ marginBottom: 12 }}>
        {mine.map((s) => (
          <a key={s.id} href={`/consultations?student=${s.id}`}
             className="chip" style={s.id === selected.id ? { borderColor: 'var(--seal)', color: 'var(--seal)', fontWeight: 700 } : {}}>
            {s.surname} {s.otherNames}
          </a>
        ))}
      </p>

      <div className="box">
        <strong>{selected.surname}, {selected.otherNames}</strong> — {projectOf(selected.id)?.title}
        <table className="list" style={{ marginTop: 10 }}>
          <thead>
            <tr><th>Period</th><th className="num">Graded</th><th className="num">Required</th>
              <th className="num">Mean</th><th className="num">Compliance</th>
              <th className="num">Bonus</th><th className="num">Period score</th><th>Gate</th></tr>
          </thead>
          <tbody>
            {outcome.periods.map((p) => (
              <tr key={p.periodId}>
                <td>{p.periodId}</td>
                <td className="num mono">{p.gradedCount}</td>
                <td className="num mono">{p.requiredCount}</td>
                <td className="num mono">{p.rawMean === null ? '—' : p.rawMean.toFixed(1)}</td>
                <td className="num mono">{p.complianceFactor}</td>
                <td className="num mono">{p.engagementBonus}</td>
                <td className="num mono"><strong>{p.score ?? '—'}</strong></td>
                <td>{p.gateMet
                  ? <span className="chip ok">met</span>
                  : <span className="chip warn">{p.requiredCount - p.gradedCount} short</span>}</td>
              </tr>
            ))}
            <tr style={{ background: '#F4F6F2', fontWeight: 700 }}>
              <td colSpan={6}>Consultation component — mean of the periods</td>
              <td className="num mono">{outcome.percentage ?? '—'}</td>
              <td className="mono">
                {outcome.percentage === null ? '' : `${((outcome.percentage / 100) * 20).toFixed(2)} of 20 points`}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <table className="list">
        <thead>
          <tr>
            <th style={{ width: 90 }}>Held</th>
            <th style={{ width: 60 }}>Period</th>
            <th>Agenda</th>
            <th style={{ width: 110 }}>Status</th>
            <th style={{ width: 150 }}>Attestation</th>
            <th style={{ width: 130 }} className="num">Mark of 100</th>
            <th style={{ width: 90 }} className="num">Counts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const counts = c.status === 'COMPLETED' && c.supervisorAttested && c.studentAttested && c.rawTotal !== null;
            return (
              <tr key={c.id}>
                <td className="mono" style={{ fontSize: 11 }}>{c.heldAt.slice(0, 10)}</td>
                <td>{c.periodId}</td>
                <td>{c.agenda}</td>
                <td style={{ fontSize: 11.5 }}>{c.status.replaceAll('_', ' ').toLowerCase()}</td>
                <td style={{ fontSize: 11.5 }}>
                  {c.supervisorAttested ? <span className="chip ok">supervisor</span>
                    : <form action={attest} style={{ display: 'inline' }}>
                        <input type="hidden" name="id" value={c.id} />
                        <button className="btn ghost" style={{ padding: '2px 8px', fontSize: 11 }}>attest</button>
                      </form>}
                  {c.studentAttested ? <span className="chip ok">student</span> : <span className="chip warn">student pending</span>}
                </td>
                <td className="num">
                  {c.status === 'COMPLETED' ? (
                    <form action={grade} style={{ display: 'inline' }}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="studentId" value={selected.id} />
                      <input className="mark" name="rawTotal" type="number" min={0} max={100}
                             defaultValue={c.rawTotal ?? ''} style={{ width: 58 }} />
                      <button className="btn ghost" style={{ padding: '3px 8px', fontSize: 11, marginLeft: 4 }}>save</button>
                    </form>
                  ) : <span className="muted">—</span>}
                  {c.rawTotal !== null && (
                    <div className="muted mono" style={{ fontSize: 10.5 }}>
                      {normalisePercentage(c.rawTotal, c.rubricMax).toFixed(1)}%
                    </div>
                  )}
                </td>
                <td className="num" style={{ fontSize: 11.5 }}>
                  {counts ? <span className="chip ok">yes</span> : <span className="chip">no</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <form action={addSession} className="box" style={{ marginTop: 14 }}>
        <input type="hidden" name="studentId" value={selected.id} />
        <strong>Record a session held today</strong>
        <p style={{ margin: '8px 0 0' }}>
          <select name="periodId" style={{ padding: 6 }}>
            <option value="SEM2">Semester 2</option>
            <option value="SEM1">Semester 1</option>
          </select>{' '}
          <input name="agenda" placeholder="What was reviewed" style={{ padding: 6, width: 320 }} />{' '}
          <button className="btn" type="submit">Add session</button>
        </p>
        <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
          A new session starts unattested and ungraded, so it does not count until both parties
          confirm it and a mark is recorded.
        </p>
      </form>
    </>
  );
}
