import { redirect, notFound } from 'next/navigation';
import { loadJoinInstitution, joinStudent, joinStaff, type JoinRole } from '@/lib/join';
import { PROGRAMMES, COURSES, CYCLE } from '@/lib/data/store';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

const STAFF_ROLES: ReadonlyArray<{ value: JoinRole; label: string }> = [
  { value: 'SUPERVISOR', label: 'Supervisor (mentor)' },
  { value: 'ASSESSOR', label: 'Departmental assessor' },
  { value: 'MODERATOR', label: 'Moderator / second assessor' },
];

function monogramFor(name: string): string {
  return name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'RC';
}

async function joinStudentAction(formData: FormData) {
  'use server';
  const slug = String(formData.get('slug') ?? '');
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  if (password !== confirm) {
    redirect(`/join/${slug}?kind=student&e=${encodeURIComponent('Passwords do not match.')}`);
  }
  const r = await joinStudent({
    slug,
    studentNumber: String(formData.get('studentNumber') ?? ''),
    surname: String(formData.get('surname') ?? ''),
    otherNames: String(formData.get('otherNames') ?? ''),
    programme: String(formData.get('programme') ?? ''),
    courseCode: String(formData.get('courseCode') ?? ''),
    email: String(formData.get('email') ?? ''),
    password,
  });
  if (!r.ok) redirect(`/join/${slug}?kind=student&e=${encodeURIComponent(r.error)}`);
  redirect('/login?registered=student');
}

async function joinStaffAction(formData: FormData) {
  'use server';
  const slug = String(formData.get('slug') ?? '');
  const requestedRoles = (formData.getAll('roles') as string[]).filter(
    (r): r is JoinRole => r === 'SUPERVISOR' || r === 'ASSESSOR' || r === 'MODERATOR',
  );
  const r = await joinStaff({
    slug,
    username: String(formData.get('username') ?? ''),
    surname: String(formData.get('surname') ?? ''),
    otherNames: String(formData.get('otherNames') ?? ''),
    email: String(formData.get('email') ?? ''),
    requestedRoles,
    justification: String(formData.get('justification') ?? ''),
  });
  if (!r.ok) redirect(`/join/${slug}?kind=staff&e=${encodeURIComponent(r.error)}`);
  redirect('/login?registered=staff');
}

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ kind?: string; e?: string }>;
}) {
  const { slug } = await params;
  const { kind, e } = await searchParams;
  const info = await loadJoinInstitution(slug);
  if (!info) notFound();

  const isStaff = kind === 'staff';
  const mono = monogramFor(info.name);

  if (info.suspended) {
    return (
      <main className="auth-main" style={{ padding: '64px 24px' }}>
        <div className="auth-main-inner ui-enter">
          <h1 className="page">Join {info.name}</h1>
          <div className="notice bad">This institution is not accepting new members right now.</div>
          <p><a href="/login">Back to sign in</a></p>
        </div>
      </main>
    );
  }

  return (
    <div className="auth-split" style={{ '--accent': info.accentColor } as React.CSSProperties}>
      <aside className="auth-brand">
        <div className="auth-brand-inner ui-enter">
          <div className="brand-logo">{mono}</div>
          <p className="inst">{info.name}</p>
          <p className="unit">Research project supervision</p>
          <h2>Join {info.name}</h2>
          <p className="tagline">
            Register with your student number to start straight away, or request staff
            access for a coordinator to review and activate.
          </p>
          <div className="brand-foot">Cycle {CYCLE} · Accounts held locally</div>
        </div>
      </aside>

      <div className="auth-main">
        <div className="auth-main-inner ui-enter">
          <div className="crest">
            <p className="inst">{info.name}</p>
            <p className="unit">Research project supervision</p>
          </div>

          <h1 className="page">Join {info.name}</h1>
          <p className="lede">
            {isStaff
              ? 'Request staff access. A coordinator reviews and activates your account before you can sign in.'
              : 'Register with your student number. You can sign in straight away and start choosing topics.'}
          </p>

          <div className="tabs-switch">
            <a className={!isStaff ? 'on' : ''} href={`/join/${slug}?kind=student`}>Student</a>
            <a className={isStaff ? 'on' : ''} href={`/join/${slug}?kind=staff`}>Staff</a>
          </div>

          {e && <div className="notice bad">{e}</div>}

          {!isStaff ? (
            <form action={joinStudentAction} className="box form-grid">
              <input type="hidden" name="slug" value={slug} />
              <p>
                <label>Student number
                  <input name="studentNumber" inputMode="numeric" pattern="[0-9]{9}" maxLength={9}
                         placeholder="e.g. 202500123" autoFocus required />
                </label>
              </p>
              <p>
                <label>Surname
                  <input name="surname" required />
                </label>
              </p>
              <p>
                <label>Given names
                  <input name="otherNames" required />
                </label>
              </p>
              <p>
                <label>Programme
                  <select name="programme" defaultValue={PROGRAMMES[1]}>
                    {PROGRAMMES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
              </p>
              <p>
                <label>Course
                  <select name="courseCode" required defaultValue="">
                    <option value="" disabled>Select your course…</option>
                    {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              </p>
              <p>
                <label>Email <span className="muted">(used to sign in)</span>
                  <input name="email" type="email" placeholder="you@example.ac.sz" required />
                </label>
              </p>
              <p>
                <label>Password
                  <input name="password" type="password" minLength={8} required />
                </label>
                <span className="muted" style={{ fontSize: 12 }}>At least 8 characters — no composition rules.</span>
              </p>
              <p>
                <label>Repeat password
                  <input name="confirm" type="password" minLength={8} required />
                </label>
              </p>
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Button type="submit">Join as a student</Button>
                <a href="/login" className="muted" style={{ fontSize: 13 }}>Already have an account? Sign in</a>
              </div>
            </form>
          ) : (
            <form action={joinStaffAction} className="box form-grid">
              <input type="hidden" name="slug" value={slug} />
              <p>
                <label>Surname
                  <input name="surname" autoFocus required />
                </label>
              </p>
              <p>
                <label>Given names
                  <input name="otherNames" required />
                </label>
              </p>
              <p>
                <label>Username
                  <input name="username" autoCapitalize="none" autoCorrect="off" required />
                </label>
              </p>
              <p>
                <label>Email <span className="muted">(used to sign in)</span>
                  <input name="email" type="email" required />
                </label>
              </p>
              <div style={{ gridColumn: '1 / -1' }}>
                <span className="field-label">Roles you are requesting</span>
                <div className="role-checks">
                  {STAFF_ROLES.map((r) => (
                    <label key={r.value} className="role-check">
                      <input type="checkbox" name="roles" value={r.value} /> {r.label}
                    </label>
                  ))}
                </div>
                <span className="muted" style={{ fontSize: 12 }}>
                  Coordinator and administrator roles are assigned by existing coordinators, not self-requested.
                </span>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label>Why do you need access?
                  <textarea name="justification" rows={3} style={{ width: '100%' }}
                            placeholder="e.g. Supervising three CSC 400 students this cycle…" required />
                </label>
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Button type="submit">Request access</Button>
                <a href="/login" className="muted" style={{ fontSize: 13 }}>Back to sign in</a>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
