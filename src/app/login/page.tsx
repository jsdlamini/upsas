import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { login, type UserRecord } from '@/lib/auth/login';
import { createSession, COOKIE, currentPrincipal } from '@/lib/auth/current';
import { verifyTotp } from '@/lib/auth/totp';
import { checkLoginRate } from '@/lib/auth/rate-limit';
import { randomBytes } from 'node:crypto';
import { CYCLE, passwordHashFor, findPersonByIdentifier, allPeople } from '@/lib/data/store';
import { getInstitution, monogramText, logoUrl } from '@/lib/institution';
import { AuthGallery } from '@/components/auth-gallery';
import {
  authPrismaAvailable,
  ensureUsersSynced,
  findUserPrisma,
  syncOneUserToPrisma,
  recordFailurePrisma,
  recordSuccessPrisma,
  recordAuditPrisma,
  totpSecretForPrisma,
} from '@/lib/auth/prisma-auth';
import { Button } from '@/components/ui/button';

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
  RATE_LIMITED: 'Too many sign-in attempts. Wait a few minutes, then try again.',
};

/**
 * Where to go after signing in. Only an internal path is ever honoured, so a
 * crafted link cannot use the sign-in page to bounce someone off-site. This is
 * what lets a link in an email land on the booking it is about.
 */
function safeNext(value: unknown): string | null {
  const next = typeof value === 'string' ? value : '';
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  if (next.startsWith('/login')) return null;
  return next;
}

async function signIn(formData: FormData) {
  'use server';
  const next = safeNext(formData.get('next'));
  const carry = next ? `&next=${encodeURIComponent(next)}` : '';
  const challengeId = String(formData.get('challenge') ?? '');
  const code = String(formData.get('code') ?? '');

  let username = String(formData.get('username') ?? '');
  let password = String(formData.get('password') ?? '');
  let firstFactorDone = false;

  if (challengeId) {
    const challenge = CHALLENGES.get(challengeId);
    CHALLENGES.delete(challengeId);
    if (!challenge || challenge.expiresAt < Date.now()) {
      redirect(`/login?e=CHALLENGE_EXPIRED${carry}`);
    }
    username = challenge.username;
    password = '';
    firstFactorDone = true;
  }

  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rateKey = username || ip;
  if (!checkLoginRate(rateKey).allowed || !checkLoginRate(`ip:${ip}`).allowed) {
    redirect(`/login?e=RATE_LIMITED${carry}`);
  }

  const person = findPersonByIdentifier(username);
  let totpSecret = person?.totpSecret ?? '';
  let usePrisma = false;
  try {
    usePrisma = await authPrismaAvailable();
    if (usePrisma) {
      await ensureUsersSynced(allPeople(), passwordHashFor);
      totpSecret = await totpSecretForPrisma(username);
    }
  } catch {
    usePrisma = false;
  }

  // In-memory record is the fallback when Postgres is unreachable.
  const record: UserRecord | null = person
    ? {
        id: person.id, username: person.username, status: person.status ?? 'ACTIVE',
        passwordHash: await passwordHashFor(person.username), failedAttempts: 0, lockedUntil: null,
        totpConfirmed: person.totpConfirmed, grants: person.grants,
      }
    : null;

  const deps = usePrisma
    ? {
        findUser: async (u: string) => {
          let prismaUser = await findUserPrisma(u);
          if (!prismaUser) {
            // A student may have registered after the initial sync — sync them
            // on demand so the Prisma-backed auth can find them.
            const p = findPersonByIdentifier(u);
            if (p) {
              try {
                await syncOneUserToPrisma(p, await passwordHashFor(p.username));
                prismaUser = await findUserPrisma(u);
              } catch { /* fall through to in-memory */ }
            }
          }
          if (prismaUser) return prismaUser;
          // Last resort: in-memory record (lockout/audit are best-effort here).
          const p = findPersonByIdentifier(u);
          return p
            ? {
                id: p.id, username: p.username, status: p.status ?? 'ACTIVE',
                passwordHash: await passwordHashFor(p.username), failedAttempts: 0, lockedUntil: null,
                totpConfirmed: p.totpConfirmed, grants: p.grants,
              }
            : null;
        },
        recordFailure: recordFailurePrisma,
        recordSuccess: recordSuccessPrisma,
        audit: recordAuditPrisma,
      }
    : {
        findUser: async () => record,
        recordFailure: async () => {},
        recordSuccess: async () => {},
        audit: async (e: { action: string; actorId: string | null; entityId: string; detail: Record<string, unknown> }) => {
          console.log('[audit]', e.action, e.entityId, JSON.stringify(e.detail));
        },
      };

  const outcome = await login(
    { username, password, cycleId: CYCLE, now: new Date(),
      passwordVerified: firstFactorDone,
      mfaVerified: firstFactorDone && verifyTotp(totpSecret, code) },
    deps,
  );

  if (outcome.status === 'MFA_REQUIRED') {
    const id = randomBytes(16).toString('base64url');
    CHALLENGES.set(id, { userId: outcome.userId, username, expiresAt: Date.now() + CHALLENGE_TTL_MS });
    redirect(`/login?e=MFA_REQUIRED&challenge=${id}${carry}`);
  }
  if (outcome.status !== 'OK') {
    redirect(`/login?e=${outcome.status}&u=${encodeURIComponent(username)}${carry}`);
  }

  const issued = createSession(outcome.principal.userId, outcome.principal.mfaSatisfied);
  const jar = await cookies();
  jar.set(COOKIE, `${issued.record.id}.${issued.token}`, {
    httpOnly: true, sameSite: 'lax', path: '/', expires: new Date(issued.record.expiresAt),
  });
  redirect(next ?? '/');
}

export default async function LoginPage({
  searchParams,
}: { searchParams: Promise<{ e?: string; u?: string; challenge?: string; registered?: string; next?: string }> }) {
  const { e, u, challenge, registered, next: rawNext } = await searchParams;
  const next = safeNext(rawNext);
  if (await currentPrincipal()) redirect(next ?? '/');
  const needsCode = e === 'MFA_REQUIRED' && Boolean(challenge);
  const inst = await getInstitution();
  const mono = await monogramText();
  const logo = await logoUrl();

  return (
    <div className="auth-split">
      <aside className="auth-brand">
        <div className="auth-brand-inner ui-enter">
          {logo ? <img src={logo} alt="" className="brand-logo-img" /> : <div className="brand-logo">{mono}</div>}
          <p className="inst">{[inst.name, inst.location].filter(Boolean).join(', ')}</p>
          <p className="unit">{inst.department}</p>
          <h2>Research project supervision &amp; assessment</h2>
          <p className="tagline">One system of record for topics, consultations, presentations and final marks — from allocation to release.</p>
          <ul className="brand-points">
            <li>Topic selection &amp; agreements</li>
            <li>Supervision consultations &amp; register</li>
            <li>Panel grading &amp; moderation</li>
            <li>Released results &amp; reports</li>
          </ul>
          <AuthGallery />
          <div className="brand-foot">Cycle {CYCLE} · Accounts held locally — no external sign-in</div>
        </div>
      </aside>
      <div className="auth-main">
        <div className="auth-main-inner ui-enter">
          <div className="crest">
            <p className="inst">{[inst.name, inst.location].filter(Boolean).join(', ')}</p>
            <p className="unit">{inst.department} — Research project supervision</p>
          </div>
          <h1 className="page">{needsCode ? 'One more step' : 'Sign in'}</h1>
      {process.env.DEMO_LOGIN_HINT && (
        <div className="demo-hint">
          <strong>Demo access</strong>
          <p className="mono" style={{ whiteSpace: 'pre-line', margin: 0 }}>{process.env.DEMO_LOGIN_HINT}</p>
        </div>
      )}
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
                <input name="username" defaultValue={u ?? ''} autoComplete="username" autoFocus required />
              </label>
            </p>
            <p style={{ margin: '0 0 10px' }}>
              <label>Password
                <input name="password" type="password" autoComplete="current-password" required />
              </label>
            </p>
          </>
        )}
        {needsCode && <input type="hidden" name="challenge" value={challenge} />}
        {next && <input type="hidden" name="next" value={next} />}
        {needsCode && (
          <p style={{ margin: '0 0 10px' }}>
            <label>Authenticator code
              <input name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" autoFocus
                     className="mono" style={{ width: 150, letterSpacing: 5, fontSize: 16, display: 'block', marginTop: 8 }} />
            </label>
          </p>
        )}
        <Button type="submit">{needsCode ? 'Verify code' : 'Sign in'}</Button>
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
        </div>
      </div>
    </div>
  );
}
