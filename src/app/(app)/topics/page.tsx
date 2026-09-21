import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/lib/auth/current';
import { can } from '@/lib/rbac/policy';
import {
  allTopics, topicsBySupervisor, findTopic, findPerson, findStudent, projectOf,
  addTopic, bulkAddTopics, proposeTopic, acceptProposal, setPreferences,
  preferencesOf, preferencesForTopic, loadOf, CAPACITY, PEOPLE,
  runAllocation, unallocatedStudents,
} from '@/lib/data/store';

export const dynamic = 'force-dynamic';

async function createTopic(formData: FormData) {
  'use server';
  const p = await currentPrincipal();
  if (!p) redirect('/login');
  const d = can(p, 'topic.publish');
  if (!d.allow) redirect(`/topics?e=${encodeURIComponent(d.reason)}`);
  const r = addTopic(p.userId, String(formData.get('title') ?? ''), String(formData.get('description') ?? ''),
                     String(formData.get('prerequisites') ?? ''), Number(formData.get('capacity') ?? 1),
                     formData.get('groupSuitable') === 'on');
  redirect(`/topics?${r.ok ? 'saved=1' : `e=${encodeURIComponent(r.error)}`}`);
}

async function bulkUpload(formData: FormData) {
  'use server';
  const p = await currentPrincipal();
  if (!p) redirect('/login');
  const d = can(p, 'topic.publish');
  if (!d.allow) redirect(`/topics?e=${encodeURIComponent(d.reason)}`);
  const { added, skipped } = bulkAddTopics(p.userId, String(formData.get('bulk') ?? ''));
  redirect(`/topics?added=${added}&skipped=${skipped}`);
}

async function accept(formData: FormData) {
  'use server';
  const p = await currentPrincipal();
  if (!p) redirect('/login');
  const r = acceptProposal(String(formData.get('topicId')), p.userId);
  redirect(`/topics?${r.ok ? 'saved=1' : `e=${encodeURIComponent(r.error)}`}`);
}

async function saveChoices(formData: FormData) {
  'use server';
  const p = await currentPrincipal();
  if (!p) redirect('/login');
  const person = findPerson(p.userId);
  if (!person?.studentId) redirect('/topics?e=Only+students+rank+topics.');
  const r = setPreferences(person.studentId, [
    String(formData.get('first') ?? ''), String(formData.get('second') ?? ''), String(formData.get('third') ?? ''),
  ]);
  redirect(`/topics?${r.ok ? 'saved=1' : `e=${encodeURIComponent(r.error)}`}`);
}

async function propose(formData: FormData) {
  'use server';
  const p = await currentPrincipal();
  if (!p) redirect('/login');
  const person = findPerson(p.userId);
  if (!person?.studentId) redirect('/topics?e=Only+students+propose+topics.');
  const r = proposeTopic(person.studentId, String(formData.get('supervisorId')),
                         String(formData.get('title') ?? ''), String(formData.get('description') ?? ''));
  redirect(`/topics?${r.ok ? 'saved=1' : `e=${encodeURIComponent(r.error)}`}`);
}

async function runAllocationAction() {
  'use server';
  const p = await currentPrincipal();
  if (!p) redirect('/login');
  const d = can(p, 'topic.allocate');
  if (!d.allow) redirect(`/topics?e=${encodeURIComponent(d.reason)}`);
  const { assigned, unmatched } = runAllocation();
  redirect(`/topics?allocated=${assigned.length}&unmatched=${unmatched.length}`);
}

export default async function Topics({
  searchParams,
}: { searchParams: Promise<{ saved?: string; e?: string; added?: string; skipped?: string; allocated?: string; unmatched?: string }> }) {
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');
  const { saved, e, added, skipped, allocated, unmatched } = await searchParams;

  const person = findPerson(principal.userId);
  const isStudent = Boolean(person?.studentId);
  const isSupervisor = principal.permissions.includes('topic.publish');
  const isCoordinator = principal.permissions.includes('topic.allocate');
  const topics = allTopics().filter((t) => !t.studentProposed || t.published);
  const myPrefs = person?.studentId ? preferencesOf(person.studentId) : [];
  const unallocated = isCoordinator ? unallocatedStudents() : [];
  const proposals = isSupervisor
    ? topicsBySupervisor(principal.userId).filter((t) => t.studentProposed && !t.acceptedAt)
    : [];

  return (
    <>
      <h1 className="page">{isStudent ? 'Choose a topic' : 'My topics'}</h1>
      <p className="lede">
        {isStudent
          ? 'Browse what supervisors are offering, rank three in order, or propose your own to a supervisor you want to work with.'
          : 'Publish what you are willing to supervise. Places count students across all your topics, not per topic.'}
      </p>

      {saved && <div className="notice">Saved.</div>}
      {added && <div className="notice">{added} topics added{skipped && skipped !== '0' ? `, ${skipped} lines skipped` : ''}.</div>}
      {allocated && <div className="notice">Allocation run: {allocated} placed, {unmatched ?? 0} unmatched.</div>}
      {e && <div className="notice bad">{e}</div>}

      {isCoordinator && (
        <div className="box">
          <strong>Allocation</strong>
          <p className="muted" style={{ margin: '6px 0 10px' }}>
            {unallocated.length} student{unallocated.length !== 1 ? 's' : ''} still unallocated.
            Runs preference matching under supervisor and topic capacity.
          </p>
          <form action={runAllocationAction}>
            <button className="btn" type="submit" disabled={unallocated.length === 0}>
              Run allocation
            </button>
          </form>
        </div>
      )}

      {isSupervisor && (
        <>
          <div className="box">
            <strong>Your load: {loadOf(principal.userId)} of {CAPACITY} places taken</strong>
            <span className="muted"> — counted across every topic you have published.</span>
          </div>

          {proposals.length > 0 && (
            <div className="box" style={{ borderLeftColor: 'var(--caution)' }}>
              <strong>{proposals.length} student proposal{proposals.length > 1 ? 's' : ''} waiting on you</strong>
              {proposals.map((t) => (
                <div key={t.id} style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--rule)' }}>
                  <strong>{t.title}</strong>
                  <div className="muted" style={{ fontSize: 12, margin: '3px 0 6px' }}>
                    From {findStudent(t.proposedBy ?? '')?.surname ?? 'a student'} · {t.description}
                  </div>
                  <form action={accept} style={{ display: 'inline' }}>
                    <input type="hidden" name="topicId" value={t.id} />
                    <button className="btn" style={{ padding: '4px 12px', fontSize: 12 }}>Accept and supervise</button>
                  </form>
                </div>
              ))}
            </div>
          )}

          <h2 style={{ fontSize: 15 }}>Add a topic</h2>
          <form action={createTopic} className="box">
            <p style={{ margin: '0 0 8px' }}>
              <input name="title" placeholder="Title" required style={{ width: '100%', padding: 7 }} />
            </p>
            <p style={{ margin: '0 0 8px' }}>
              <textarea name="description" rows={3} required
                        placeholder="What the student will actually do. They choose on this text, so be concrete."
                        style={{ width: '100%', padding: 7, fontFamily: 'inherit' }} />
            </p>
            <p style={{ margin: '0 0 8px' }}>
              <input name="prerequisites" placeholder="Prerequisites, e.g. Python, statistics"
                     style={{ width: '60%', padding: 7 }} />{' '}
              <input name="capacity" type="number" min={1} max={6} defaultValue={1}
                     style={{ width: 70, padding: 7 }} title="Places" />{' '}
              <label className="muted"><input type="checkbox" name="groupSuitable" defaultChecked /> suits a pair</label>
            </p>
            <button className="btn" type="submit">Publish topic</button>
          </form>

          <h2 style={{ fontSize: 15 }}>Or paste a list</h2>
          <form action={bulkUpload} className="box">
            <p className="muted" style={{ margin: '0 0 6px', fontSize: 12 }}>
              One topic per line: <span className="mono">title | description | places | prerequisites</span>.
              Lines that do not parse are skipped and counted, never guessed at.
            </p>
            <textarea name="bulk" rows={4} style={{ width: '100%', padding: 7, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
                      placeholder="Sentiment analysis of siSwati radio call-ins | Collect and annotate a corpus, then compare classifiers. | 2 | Python" />
            <p style={{ margin: '8px 0 0' }}><button className="btn" type="submit">Add these</button></p>
          </form>
        </>
      )}

      <h2 style={{ fontSize: 15 }}>Topic pool</h2>
      <div className="table-wrap">
        <table className="list">
          <thead>
            <tr>
              <th style={{ width: '44%' }}>Topic</th>
              <th style={{ width: '16%' }}>Supervisor</th>
              <th style={{ width: '18%' }}>Prerequisites</th>
              <th style={{ width: '12%' }}>Places</th>
              <th style={{ width: '10%' }}>Interest</th>
            </tr>
          </thead>
          <tbody>
            {topics.map((t) => {
              const sup = findPerson(t.supervisorId);
              const taken = loadOf(t.supervisorId);
              const full = taken >= CAPACITY;
              return (
                <tr key={t.id}>
                  <td>
                    <strong>{t.title}</strong>
                    <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{t.description}</div>
                    {t.studentProposed && <span className="chip">student proposal</span>}
                    {t.groupSuitable
                      ? <span className="chip">suits a pair</span>
                      : <span className="chip">individual only</span>}
                  </td>
                  <td>{sup?.fullName}
                    <div className="muted" style={{ fontSize: 11 }}>{taken} of {CAPACITY} places used</div></td>
                  <td className="muted" style={{ fontSize: 12 }}>{t.prerequisites || '—'}</td>
                  <td className="num">{t.capacity}{full && <div><span className="chip warn">supervisor full</span></div>}</td>
                  <td className="num mono">{preferencesForTopic(t.id).length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isStudent && (
        <>
          <h2 style={{ fontSize: 15 }}>My three choices</h2>
          {projectOf(person!.studentId!) ? (
            <div className="box">
              <strong>You are already allocated.</strong>
              <p className="muted" style={{ margin: '6px 0 0' }}>
                {projectOf(person!.studentId!)?.title} with{' '}
                {findPerson(projectOf(person!.studentId!)!.supervisorId)?.fullName}. Changing topic or
                supervisor after allocation needs both their approval and the coordinator&apos;s.
              </p>
            </div>
          ) : (
            <form action={saveChoices} className="box">
              <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
                Rank three in order. Ranking is not allocation — the coordinator matches preferences
                against supervisor capacity, and you are told the outcome.
              </p>
              {(['first', 'second', 'third'] as const).map((name, i) => (
                <p key={name} style={{ margin: '0 0 6px' }}>
                  <span className="mono" style={{ display: 'inline-block', width: 70 }}>Choice {i + 1}</span>
                  <select name={name} defaultValue={myPrefs[i]?.topicId ?? ''} style={{ padding: 6, width: 560 }}>
                    <option value="">— none —</option>
                    {topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                </p>
              ))}
              <button className="btn" type="submit">Save my choices</button>
              {myPrefs.length > 0 && (
                <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
                  Currently: {myPrefs.map((p, i) => `${i + 1}. ${findTopic(p.topicId)?.title}`).join(' · ')}
                </p>
              )}
            </form>
          )}

          <h2 style={{ fontSize: 15 }}>Propose your own</h2>
          <form action={propose} className="box">
            <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
              Goes to the supervisor you name. They accept or decline; the coordinator signs off after that.
            </p>
            <p style={{ margin: '0 0 8px' }}>
              <select name="supervisorId" style={{ padding: 7, width: 260 }}>
                {PEOPLE.filter((x) => x.grants.some((g) => g.role === 'SUPERVISOR'))
                  .map((x) => <option key={x.id} value={x.id}>{x.fullName}</option>)}
              </select>
            </p>
            <p style={{ margin: '0 0 8px' }}>
              <input name="title" placeholder="Your proposed title" required style={{ width: '100%', padding: 7 }} />
            </p>
            <p style={{ margin: '0 0 8px' }}>
              <textarea name="description" rows={3} required placeholder="The problem, why it matters, and roughly how you would approach it."
                        style={{ width: '100%', padding: 7, fontFamily: 'inherit' }} />
            </p>
            <button className="btn" type="submit">Send proposal</button>
          </form>
        </>
      )}
    </>
  );
}
