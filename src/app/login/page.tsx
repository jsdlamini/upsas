import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { login, type UserRecord } from '@/lib/auth/login';
import { createSession, COOKIE, currentPrincipal } from '@/lib/auth/current';
import { verifyTotp, currentTotpCode } from '@/lib/auth/totp';
import { randomBytes } from 'node:crypto';
import { CYCLE, DEMO_PASSWORD, PEOPLE, studentAccounts, passwordHashFor, findPersonByUsername } from '@/lib/data/store';

/**
 * Short-lived MFA challenges.
 *
 * The password is verified once. Asking for it again alongside the code would
 * train people to retype their password after a partial success, which is the
 * habit phishing relies on. The challenge proves the first factor already
 * passed and expires on its own.
 */
interface Challenge { userId: string; username: string; expiresAt: number }
const globalForChallenges = globalThis as unknown as { __upsasChallenges?: Map<string, Challenge> };
const CHALLENGES: Map<string, Challenge> = (globalForChallenges.__upsasChallenges ??= new Map());
const CHALLENGE_TTL_MS = 5 * 60_000;

export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Those details did not match an account.',
  PENDING_APPROVAL: 'This account is waiting for a coordinator to approve it.',
  SUSPENDED: 'This account is suspended.',
  DEACTIVATED: 'This account is closed.',
  NO_ACTIVE_ROLES: 'This account holds no role for the current cycle, so there is nothing to open.',
  MFA_REQUIRED: 'Password accepted. Now enter the six-digit code from your authenticator — you do not need to retype your password.',
  CHALLENGE_EXPIRED: 'That sign-in attempt expired. Start again.',
  MFA_ENROLMENT_REQUIRED: 'This role requires a second factor and none is enrolled. See a coordinator to enrol.',
};

async function signIn(formData: FormData) {
  'use server';
  const challengeId = String(formData.get('challenge') ?? '');
  const code = String(formData.get('code') ?? '');

  let username = String(formData.get('username') ?? '');
  let password = String(formData.get('password') ?? '');
  let firstFactorDone = false;

  if (challengeId) {
    const challenge = CHALLENGES.get(challengeId);
    CHALLENGES.delete(challengeId);
    if (!challenge || challenge.expiresAt < Date.now()) {
      redirect('/login?e=CHALLENGE_EXPIRED');
    }
    username = challenge.username;
    password = DEMO_PASSWORD;
    firstFactorDone = true;
  }

  const person = findPersonByUsername(username);
  const record: UserRecord | null = person
    ? {
        id: person.id, username: person.username, status: person.status ?? 'ACTIVE',
        passwordHash: await passwordHashFor(person.username), failedAttempts: 0, lockedUntil: null,
        totpConfirmed: person.totpConfirmed, grants: person.grants,
      }
    : null;

  const outcome = await login(
    { username, password, cycleId: CYCLE, now: new Date(),
      mfaVerified: firstFactorDone && verifyTotp(person?.totpSecret ?? '', code) },
    {
      findUser: async () => record,
      recordFailure: async () => {},
      recordSuccess: async () => {},
      // Every outcome lands in the audit chain; console stands in for the writer.
      audit: async (e) => { console.log('[audit]', e.action, e.entityId, JSON.stringify(e.detail)); },
    },
  );

  if (outcome.status === 'MFA_REQUIRED') {
    const id = randomBytes(16).toString('base64url');
    CHALLENGES.set(id, { userId: outcome.userId, username, expiresAt: Date.now() + CHALLENGE_TTL_MS });
    redirect(`/login?e=MFA_REQUIRED&challenge=${id}`);
  }
  if (outcome.status !== 'OK') {
    redirect(`/login?e=${outcome.status}&u=${encodeURIComponent(username)}`);
  }

  const issued = createSession(outcome.principal.userId, outcome.principal.mfaSatisfied);
  const jar = await cookies();
  jar.set(COOKIE, `${issued.record.id}.${issued.token}`, {
    httpOnly: true, sameSite: 'lax', path: '/', expires: new Date(issued.record.expiresAt),
  });
  redirect('/');
}

export default async function LoginPage({
  searchParams,
}: { searchParams: Promise<{ e?: string; u?: string; challenge?: string; registered?: string }> }) {
  if (await currentPrincipal()) redirect('/');
  const { e, u, challenge, registered } = await searchParams;
  const needsCode = e === 'MFA_REQUIRED' && Boolean(challenge);
  const coordinatorSecret = findPersonByUsername('coordinator')?.totpSecret ?? '';
  const coordinatorCode = coordinatorSecret ? currentTotpCode(coordinatorSecret) : null;

  return (
    <div className="auth-split">
      <aside className="auth-brand">
        <div className="auth-brand-inner">
          <div className="brand-logo">RC</div>
          <p className="inst">University of Eswatini, Kwaluseni</p>
          <p className="unit">Department of Computer Science</p>
          <h2>Research project supervision &amp; assessment</h2>
          <p className="tagline">One system of record for topics, consultations, presentations and final marks — from allocation to release.</p>
          <ul className="brand-points">
            <li>Topic selection &amp; agreements</li>
            <li>Supervision consultations &amp; register</li>
            <li>Panel grading &amp; moderation</li>
            <li>Released results &amp; reports</li>
          </ul>
          <div className="brand-foot">Cycle {CYCLE} · Accounts held locally — no external sign-in</div>
        </div>
      </aside>
      <div className="auth-main">
        <div className="auth-main-inner">
          <div className="crest">
            <p className="inst">University of Eswatini, Kwaluseni</p>
            <p className="unit">Department of Computer Science — Research project supervision</p>
          </div>
          <h1 className="page">{needsCode ? 'One more step' : 'Sign in'}</h1>
      <p className="lede">
        {needsCode
          ? 'Your password was accepted. This role needs a second factor.'
          : `Cycle ${CYCLE}. Accounts are held locally — there is no external sign-in.`}
      </p>

      {!needsCode && (
        <div className="steps">
          <span><b>1</b> Create your account</span>
          <span><b>2</b> A coordinator activates staff roles</span>
          <span><b>3</b> Sign in and land on your dashboard</span>
        </div>
      )}

      {registered === 'student' && <div className="notice">Account created — sign in below to get started.</div>}
      {registered === 'staff' && <div className="notice">Request sent — a coordinator will review it, then you can sign in.</div>}

      {e && <div className={`notice bad`}>{MESSAGES[e] ?? 'Sign-in failed.'}</div>}

      <form action={signIn} className="box">
        {!needsCode && (
          <>
            <p style={{ margin: '0 0 10px' }}>
              <label>Username
                <input name="username" defaultValue={u ?? 'coordinator'} autoFocus required />
              </label>
            </p>
            <p style={{ margin: '0 0 10px' }}>
              <label>Password
                <input name="password" type="password" defaultValue={DEMO_PASSWORD} required />
              </label>
            </p>
          </>
        )}
        {needsCode && <input type="hidden" name="challenge" value={challenge} />}
        {needsCode && (
          <p style={{ margin: '0 0 10px' }}>
            <label>Authenticator code
              <input name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoFocus
                     defaultValue={coordinatorCode ?? undefined}
                     className="mono" style={{ width: 150, letterSpacing: 5, fontSize: 16 }} />
            </label>
          </p>
        )}
        <button className="btn" type="submit">{needsCode ? 'Verify code' : 'Sign in'}</button>
        {!needsCode && (
          <a href="/recover" style={{ marginLeft: 14, fontSize: 13.5 }}>Forgotten your password?</a>
        )}
      </form>

      {!needsCode && (
        <div className="register-entry">
          <h2 style={{ margin: '0 0 8px' }}>New here?</h2>
          <p className="muted" style={{ margin: '0 0 12px' }}>
            Students self-register and can sign in straight away. Staff accounts are
            held until a coordinator approves them.
          </p>
          <div className="register-options">
            <a className="register-card" href="/register?kind=student">
              <strong>I am a student</strong>
              <span>Register with your student number and start choosing topics.</span>
            </a>
            <a className="register-card" href="/register?kind=staff">
              <strong>I am staff</strong>
              <span>Request supervisor, assessor or coordinator access for approval.</span>
            </a>
          </div>
        </div>
      )}

      {!needsCode && (
        <div className="box demo-box">
          <strong>Demo access</strong>
          <p className="muted" style={{ margin: '6px 0' }}>
            For evaluation only — not for real students. Password for every account:
            <span className="mono">{DEMO_PASSWORD}</span>
          </p>
          <div className="table-wrap">
            <table className="list">
              <thead><tr><th>Username</th><th>Who</th><th>Roles</th></tr></thead>
              <tbody>
                {PEOPLE.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">{p.username}</td>
                    <td>{p.fullName}</td>
                    <td className="muted">{p.grants.map((g) => g.role).join(', ')}</td>
                  </tr>
                ))}
                {studentAccounts().slice(0, 4).map((p) => (
                  <tr key={p.id}>
                    <td className="mono">{p.username}</td>
                    <td>{p.fullName} <span className="muted">(student)</span></td>
                    <td className="muted">STUDENT</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
            <span className="mono">coordinator</span> holds a privileged role, so after the password it
            asks for a six-digit TOTP code. Current code for quick testing: <span className="mono">{coordinatorCode ?? '—'}</span>.
            (Secret for an authenticator app: <span className="mono">{coordinatorSecret}</span>.)
            Every other account signs in with the password alone.
          </p>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
