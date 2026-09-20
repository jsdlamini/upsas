import { redirect } from 'next/navigation';
import { registerStudent, requestStaffAccount, PROGRAMMES, COURSES, CYCLE } from '@/lib/data/store';

export const dynamic = 'force-dynamic';

const STAFF_ROLES = [
  { value: 'SUPERVISOR', label: 'Supervisor (mentor)' },
  { value: 'ASSESSOR', label: 'Departmental assessor' },
  { value: 'MODERATOR', label: 'Moderator / second assessor' },
] as const;

async function registerStudentAction(formData: FormData) {
  'use server';
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  if (password !== confirm) {
    redirect('/register?kind=student&e=' + encodeURIComponent('Passwords do not match.'));
  }
  const r = await registerStudent({
    studentNumber: String(formData.get('studentNumber') ?? ''),
    surname: String(formData.get('surname') ?? ''),
    otherNames: String(formData.get('otherNames') ?? ''),
    programme: String(formData.get('programme') ?? ''),
    courseCode: String(formData.get('courseCode') ?? ''),
    email: String(formData.get('email') ?? ''),
    password,
  });
  if (!r.ok) redirect('/register?kind=student&e=' + encodeURIComponent(r.error));
  redirect('/login?registered=student');
}

async function requestStaffAction(formData: FormData) {
  'use server';
  const requestedRoles = (formData.getAll('roles') as string[]).filter(
    (r): r is 'SUPERVISOR' | 'ASSESSOR' | 'MODERATOR' =>
      r === 'SUPERVISOR' || r === 'ASSESSOR' || r === 'MODERATOR',
  );
  const r = requestStaffAccount({
    username: String(formData.get('username') ?? ''),
    fullName: String(formData.get('fullName') ?? ''),
    email: String(formData.get('email') ?? ''),
    requestedRoles,
    justification: String(formData.get('justification') ?? ''),
  });
  if (!r.ok) redirect('/register?kind=staff&e=' + encodeURIComponent(r.error));
  redirect('/login?registered=staff');
}

export default async function RegisterPage({
  searchParams,
}: { searchParams: Promise<{ kind?: string; e?: string }> }) {
  const { kind, e } = await searchParams;
  const isStaff = kind === 'staff';

  return (
    <div className="auth-split">
      <aside className="auth-brand">
        <div className="auth-brand-inner">
          <div className="brand-logo">RC</div>
          <p className="inst">University of Eswatini, Kwaluseni</p>
          <p className="unit">Department of Computer Science</p>
          <h2>Create your account</h2>
          <p className="tagline">
            Students self-register and start straight away. Staff accounts are held for a
            coordinator to review and activate.
          </p>
          <ul className="brand-points">
            <li>Student number &amp; institutional email</li>
            <li>Staff roles assigned on approval</li>
            <li>Offline-first, local sign-in only</li>
          </ul>
          <div className="brand-foot">Cycle {CYCLE} · Accounts held locally</div>
        </div>
      </aside>
      <div className="auth-main">
        <div className="auth-main-inner">
          <div className="crest">
            <p className="inst">University of Eswatini, Kwaluseni</p>
            <p className="unit">Department of Computer Science — Research project supervision</p>
          </div>

          <h1 className="page">Create your account</h1>
          <p className="lede">
            {isStaff
              ? 'Request staff access. A coordinator reviews and activates your account before you can sign in.'
              : 'Register with your student number. You can sign in straight away and start choosing topics.'}
          </p>

        <div className="tabs-switch">
          <a className={!isStaff ? 'on' : ''} href="/register?kind=student">Student</a>
          <a className={isStaff ? 'on' : ''} href="/register?kind=staff">Staff</a>
        </div>

        {e && <div className="notice bad">{e}</div>}

        {!isStaff ? (
          <form action={registerStudentAction} className="box form-grid">
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
                <select name="courseCode" defaultValue={COURSES[2]}>
                  {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </p>
            <p>
              <label>Email <span className="muted">(optional)</span>
                <input name="email" type="email" placeholder="you@example.ac.sz" />
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
              <button className="btn" type="submit">Create my account</button>
              <a href="/login" className="muted" style={{ fontSize: 13 }}>Already have an account? Sign in</a>
            </div>
          </form>
        ) : (
          <form action={requestStaffAction} className="box form-grid">
            <p>
              <label>Full name
                <input name="fullName" autoFocus required />
              </label>
            </p>
            <p>
              <label>Username
                <input name="username" autoCapitalize="none" autoCorrect="off" required />
              </label>
            </p>
            <p>
              <label>Email
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
              <button className="btn" type="submit">Request access</button>
              <a href="/login" className="muted" style={{ fontSize: 13 }}>Back to sign in</a>
            </div>
          </form>
        )}
        </div>
      </div>
    </div>
  );
}
