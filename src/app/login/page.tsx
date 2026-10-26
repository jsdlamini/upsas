import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { login, type UserRecord } from '@/lib/auth/login';
import { createSession, COOKIE, currentPrincipal } from '@/lib/auth/current';
import { verifyTotp } from '@/lib/auth/totp';
import { checkLoginRate } from '@/lib/auth/rate-limit';
import { randomBytes } from 'node:crypto';
import { passwordHashFor, findPersonByIdentifier, allPeople } from '@/lib/data/store';
import { currentCycleId } from '@/lib/cycles';
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
import { QuantumMark } from '@/components/quantum-mark';

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
  LOCKED: 'Too many failed attempts — this account is temporarily locked. Wait a few minutes, then try again.',
  NO_ACTIVE_ROLES: 'This account holds no role for the current cycle, so there is nothing to open.',
  MFA_REQUIRED: 'Password accepted. Now enter the six-digit code from your authenticator — you do not need to retype your password.',
  CHALLENGE_EXPIRED: 'That sign-in attempt expired. Start again.',
  MFA_ENROLMENT_REQUIRED: 'This role requires a second factor and none is enrolled. See a coordinator to enrol.',
  RATE_LIMITED: 'Too many sign-in attempts. Wait a few minutes, then try again.',
};

const PRODUCT_NAME = 'Research Chain';

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

  // The cycle is resolved from the tenant of the account once it is found.
  let tenantId = 'default';

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
        id: person.id, tenantId: 'default', username: person.username, status: person.status ?? 'ACTIVE',
        passwordHash: await passwordHashFor(person.username), failedAttempts: 0, lockedUntil: null,
        totpConfirmed: person.totpConfirmed, grants: person.grants,
      }
    : null;

  const deps = usePrisma
    ? {
        findUser: async (u: string) => {
          let prismaUser: UserRecord | null = null;
          try {
            prismaUser = await findUserPrisma(u);
            // seedPrismaDomain creates identity rows without a password
            // credential, and a student may have registered after the initial
            // sync. In either case the Prisma row is incomplete, so backfill it
            // from the in-memory store (the source of truth for the current
            // password hash) before verifying.
            if (!prismaUser || !prismaUser.passwordHash) {
              const p = findPersonByIdentifier(u);
              if (p) {
                await syncOneUserToPrisma(p, await passwordHashFor(p.username));
                prismaUser = await findUserPrisma(u);
              }
            }
          } catch { /* DB unreachable or write failed — fall through to in-memory */ }
          if (prismaUser && prismaUser.passwordHash) {
            tenantId = prismaUser.tenantId;
            return prismaUser;
          }
          // Last resort: in-memory record (lockout/audit are best-effort here).
          const p = findPersonByIdentifier(u);
          return p
            ? {
                id: p.id, tenantId: 'default', username: p.username, status: p.status ?? 'ACTIVE',
                passwordHash: await passwordHashFor(p.username), failedAttempts: 0, lockedUntil: null,
                totpConfirmed: p.totpConfirmed, grants: p.grants,
              }
            : null;
        },
        recordFailure: recordFailurePrisma,
        recordSuccess: recordSuccessPrisma,
        audit: async (e: { action: string; actorId: string | null; entityId: string; detail: Record<string, unknown> }) => {
          // Best-effort only: an audit write must never swallow the sign-in
          // outcome, or a failed login would show no error at all.
          try { await recordAuditPrisma(e); } catch { /* audit is append-only but never blocking */ }
        },
      }
    : {
        findUser: async () => record,
        recordFailure: async () => {},
        recordSuccess: async () => {},
        audit: async (e: { action: string; actorId: string | null; entityId: string; detail: Record<string, unknown> }) => {
          console.log('[audit]', e.action, e.entityId, JSON.stringify(e.detail));
        },
      };

  // Resolve the cycle from the account's tenant before authenticating.
  // `findUser` runs again inside login() and returns the same record; the
  // second pass is a cheap read (backfill is idempotent).
  try {
    const identified = await deps.findUser(username);
    if (identified) tenantId = identified.tenantId;
  } catch { /* keep the 'default' fallback */ }
  const cycleId = await currentCycleId(tenantId);
  const outcome = await login(
    { username, password, cycleId, now: new Date(),
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
  redirect(next ?? '/welcome');
}

export default async function LoginPage({
  searchParams,
}: { searchParams: Promise<{ e?: string; u?: string; challenge?: string; registered?: string; next?: string }> }) {
  const { e, u, challenge, registered, next: rawNext } = await searchParams;
  const next = safeNext(rawNext);
  if (await currentPrincipal()) redirect(next ?? '/welcome');
  const needsCode = e === 'MFA_REQUIRED' && Boolean(challenge);

  return (
    <div className="auth-split">
      <aside className="auth-brand">
        <div className="auth-brand-inner">
          <div className="brand-lockup" style={{ alignItems: 'flex-start', textAlign: 'left', display: 'flex', flexDirection: 'row', gap: 14 }}>
            <div className="brand-logo-quantum" style={{ width: 48, height: 48, margin: 0, flex: '0 0 auto' }}><QuantumMark /></div>
            <div>
              <p className="inst" style={{ margin: 0 }}>{PRODUCT_NAME}</p>
              <p className="unit" style={{ margin: '2px 0 0' }}>Research project supervision &amp; assessment</p>
            </div>
          </div>
          <h2>Everything between topic allocation and the final mark.</h2>
          <p className="tagline">
            Research Chain is the department&apos;s system of record — topics, consultations, panel
            marking and released results, held in one auditable chain.
          </p>
          <ul className="brand-points">
            <li>Topic selection and agreements</li>
            <li>Supervision consultations and register</li>
            <li>Panel grading and moderation</li>
            <li>Released results and reports</li>
          </ul>
          <div className="brand-shots" aria-hidden="true">
            <div className="brand-shot shot-a">
              <img src="/screenshots/03-topics.png" alt="" loading="lazy" />
            </div>
            <div className="brand-shot shot-b">
              <img src="/screenshots/07-grading.png" alt="" loading="lazy" />
            </div>
            <div className="brand-shot shot-c">
              <img src="/screenshots/02-dashboard.png" alt="" loading="lazy" />
            </div>
          </div>
          <div className="brand-foot">Runs on your own server. Accounts stay local — no external sign-in, no tracking.</div>
        </div>
      </aside>
      <div className="auth-main">
        <div className="auth-main-inner">
          <div className="crest">
            <p className="inst">{PRODUCT_NAME}</p>
            <p className="unit">Research project supervision &amp; assessment</p>
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
          : 'Accounts are held on this server — there is no external sign-in.'}
      </p>

      {registered === 'student' && <div className="notice">Account created — sign in below to get started.</div>}
      {registered === 'staff' && <div className="notice">Request sent — a coordinator will review it, then you can sign in.</div>}

      {e && <div className={`notice bad`}>{MESSAGES[e] ?? 'Sign-in failed.'}</div>}

      <form action={signIn} className="box" style={{ padding: 20 }}>
        {!needsCode && (
          <>
            <p style={{ margin: '0 0 12px' }}>
              <label>Email or student number
                <input name="username" type="text" defaultValue={u ?? ''} autoComplete="username" autoFocus required />
              </label>
            </p>
            <p style={{ margin: '0 0 16px' }}>
              <label>Password
                <input name="password" type="password" autoComplete="current-password" required />
              </label>
            </p>
          </>
        )}
        {needsCode && <input type="hidden" name="challenge" value={challenge} />}
        {next && <input type="hidden" name="next" value={next} />}
        {needsCode && (
          <p style={{ margin: '0 0 16px' }}>
            <label>Six-digit code from your authenticator
              <input name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" autoFocus
                     className="mono" style={{ width: 160, letterSpacing: 6, fontSize: 16, display: 'block', marginTop: 8 }} />
            </label>
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <Button type="submit">{needsCode ? 'Verify code' : 'Sign in'}</Button>
          {!needsCode && (
            <a href="/recover" style={{ fontSize: 13.5 }}>Forgotten your password?</a>
          )}
        </div>
      </form>

      {!needsCode && (
        <div className="register-entry">
          <h2 style={{ margin: '0 0 8px' }}>New here?</h2>
          <p className="muted" style={{ margin: '0 0 12px' }}>
            Students register themselves and can sign in straight away. Staff accounts wait until a
            coordinator approves them.
          </p>
          <div className="register-options">
            <a className="register-card" href="/signup">
              <span className="register-card-title">
                <svg className="register-card-icon" width="17" height="17" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                     aria-hidden="true" focusable="false">
                  <rect x="4.5" y="3" width="15" height="18" rx="1.5" />
                  <path d="M9.5 21v-3.5h5V21" />
                  <path d="M8.5 7h.01M12 7h.01M15.5 7h.01M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01" />
                </svg>
                <strong>I run an institution</strong>
              </span>
              <span className="register-card-text">Set up a private workspace for your institution — you become its first coordinator.</span>
            </a>
            <a className="register-card" href="/register?kind=student">
              <span className="register-card-title">
                <svg className="register-card-icon" width="17" height="17" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                     aria-hidden="true" focusable="false">
                  <path d="M22 9.5 12 4.5l-10 5 10 5 10-5z" />
                  <path d="M6 12v4.6c0 1.6 2.7 2.9 6 2.9s6-1.3 6-2.9V12" />
                </svg>
                <strong>I am a student</strong>
              </span>
              <span className="register-card-text">Register with your student number and start ranking topics today.</span>
            </a>
            <a className="register-card" href="/register?kind=staff">
              <span className="register-card-title">
                <svg className="register-card-icon" width="17" height="17" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                     aria-hidden="true" focusable="false">
                  <path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                  <path d="m16.5 11.5 2 2 4-4" />
                </svg>
                <strong>I am staff</strong>
              </span>
              <span className="register-card-text">Request supervisor, assessor or coordinator access — a coordinator will approve you.</span>
            </a>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
