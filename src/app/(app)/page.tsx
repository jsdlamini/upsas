import { redirect } from 'next/navigation';
import { STATUS_LABEL } from '@/lib/enrolment/status';
import { currentPrincipal } from '@/lib/auth/current';
import { computeFinalMark, PROFILE_A } from '@/lib/assessment';
import {
  enrolmentOf,
  allocatedStudents, superviseesOf, projectOf, consultationsOf, docMarkOf,
  toConsultationRecords, toAssessorEntries, findPerson,
  pendingStaffRequests, approveStaffAccount, declineStaffAccount,
} from '@/lib/data/store';

export const dynamic = 'force-dynamic';

async function approveStaff(formData: FormData) {
  'use server';
  const p = await currentPrincipal();
  if (!p) redirect('/login');
  approveStaffAccount(String(formData.get('id') ?? ''));
  redirect('/?approved=1');
}

async function declineStaff(formData: FormData) {
  'use server';
  const p = await currentPrincipal();
  if (!p) redirect('/login');
  declineStaffAccount(String(formData.get('id') ?? ''));
  redirect('/?declined=1');
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
    computedBy: 'dashboard',
  }, PROFILE_A);
}

export default async function Dashboard({
  searchParams,
}: { searchParams: Promise<{ approved?: string; declined?: string }> }) {
  const { approved, declined } = await searchParams;
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');

  if (principal.roles.includes('STUDENT') && !principal.roles.includes('SUPERVISOR')) redirect('/me');
  const isCoordinator = principal.roles.includes('COORDINATOR');
  const students = isCoordinator ? allocatedStudents() : superviseesOf(principal.userId);
  const requests = isCoordinator ? pendingStaffRequests() : [];

  // Group by project so a pair appears as one row with two members.
  const byProject = new Map<string, typeof students>();
  for (const s of students) {
    const list = byProject.get(s.projectId) ?? [];
    list.push(s);
    byProject.set(s.projectId, list);
  }

  return (
    <>
      <h1 className="page">{isCoordinator ? 'Cohort' : 'My supervisees'}</h1>
      <p className="lede">
        {students.length} students in {byProject.size} projects
        {[...byProject.values()].filter((m) => m.length > 1).length > 0 &&
          `, ${[...byProject.values()].filter((m) => m.length > 1).length} of them pairs`}.
        Marks are computed live from the engine; nothing on this page is stored.
      </p>

      {approved && <div className="notice">Account activated — that staff member can now sign in.</div>}
      {declined && <div className="notice">Request declined.</div>}

      {isCoordinator && requests.length > 0 && (
        <div className="box">
          <strong>Account requests</strong>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Staff who registered and are waiting for activation before they can sign in.
          </p>
          <div className="table-wrap">
            <table className="list" style={{ marginTop: 10 }}>
              <thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Requested roles</th><th></th></tr></thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.fullName}</strong></td>
                    <td className="mono">{r.username}</td>
                    <td className="muted">{r.email}</td>
                    <td className="muted">{r.requestedRoles?.join(', ').toLowerCase()}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <form action={approveStaff} style={{ display: 'inline' }}>
                        <input type="hidden" name="id" value={r.id} />
                        <button className="btn" style={{ padding: '3px 10px', fontSize: 12 }}>Approve</button>
                      </form>{' '}
                      <form action={declineStaff} style={{ display: 'inline' }}>
                        <input type="hidden" name="id" value={r.id} />
                        <button className="btn ghost" style={{ padding: '3px 10px', fontSize: 12 }}>Decline</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {byProject.size === 0 ? (
        <div className="empty">
          <strong>No projects yet</strong>
          Once topics are allocated for this cycle, every student you supervise appears
          here with their consultation count and live marks. Publish a topic from{' '}
          <a href="/topics">My topics</a> to start.
        </div>
      ) : (
  <div className="table-wrap">
          <table className="list">
            <thead>
              <tr>
                <th style={{ width: '28%' }}>Student and project</th>
                <th style={{ width: '10%' }}>Stage</th>
                <th style={{ width: '16%' }}>Consultations</th>
                <th className="num" style={{ width: '8%' }}>CA</th>
                <th className="num" style={{ width: '8%' }}>Final</th>
                <th style={{ width: '30%' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {[...byProject.entries()].map(([projectId, members]) => {
                const project = projectOf(members[0]!.id);
                return members.map((s, i) => {
                  const snap = snapshotFor(s.id);
                  const sem1 = consultationsOf(s.id).filter((c) => c.periodId === 'SEM1' && c.status === 'COMPLETED').length;
                  const sem2 = consultationsOf(s.id).filter((c) => c.periodId === 'SEM2' && c.status === 'COMPLETED').length;
                  const short = sem1 < 4 || sem2 < 4;
                  const contribution = project?.contributionFiled[s.id] ?? true;
                  return (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.surname}, {s.otherNames}</strong>
                        {/* A supervisor needs to know a student is deferred or
                            carrying credit. They do not need the grounds. */}
                        {enrolmentOf(s.id).status !== 'ACTIVE' && (
                          <span className="chip warn" style={{ marginLeft: 6 }}>
                            {STATUS_LABEL[enrolmentOf(s.id).status]}
                          </span>
                        )}
                        <div className="muted mono" style={{ fontSize: 11 }}>
                          {s.studentNumber} · {s.programme} · {s.courseCode}
                          {members.length > 1 && ` · pair with ${members[1 - i]!.surname}`}
                        </div>
                        {i === 0 && <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{project?.title}</div>}
                      </td>
                      <td className="muted" style={{ fontSize: 11.5 }}>{project?.state.replaceAll('_', ' ').toLowerCase()}</td>
                      <td>
                        <span className="mono">SEM1 {sem1}/4 · SEM2 {sem2}/4</span>
                        {short && <span className="flag amber">Below the minimum — average is scaled down</span>}
                      </td>
                      <td className="num mono">{snap.caScore ?? '—'}</td>
                      <td className="num mono"><strong>{snap.finalMark ?? '—'}</strong>{snap.grade ? ` ${snap.grade}` : ''}</td>
                      <td>
                        {/* Each flag keeps its own severity. Folding a warning into a
                            green "computable" line paints a problem as reassurance. */}
                        {!snap.blocked && snap.flags.length === 0 && (
                          <span className="flag ok">No flags.</span>
                        )}
                        {snap.flags.map((f) => (
                          <span className={f.blocking ? 'flag red' : 'flag amber'} key={f.code}>{f.message}</span>
                        ))}
                        {!contribution && <span className="flag amber">Contribution statement not filed.</span>}
                        <a href={`/marks/${s.studentNumber}`} style={{ fontSize: 12 }}>Open breakdown</a>
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        Signed in as {findPerson(principal.userId)?.fullName}. You see{' '}
        {isCoordinator ? 'the whole cohort because you hold COORDINATOR' : 'only your own supervisees'}.
      </p>
    </>
  );
}
