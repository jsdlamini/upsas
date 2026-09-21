import { redirect } from 'next/navigation';
import { redeemResetCode } from '@/lib/data/store';
import { destroySessionsFor } from '@/lib/auth/current';
import { PASSWORD_POLICY } from '@/lib/auth/password';

export const dynamic = 'force-dynamic';

async function recover(formData: FormData) {
  'use server';
  const username = String(formData.get('username') ?? '');
  const code = String(formData.get('code') ?? '');
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  if (password !== confirm) {
    redirect(`/recover?e=${encodeURIComponent('The two passwords do not match.')}`);
  }

  const result = await redeemResetCode(username, code, password);
  if (!result.ok) redirect(`/recover?e=${encodeURIComponent(result.error)}`);

  // A reset is also the response to a stolen password, so every session that
  // account holds ends here rather than continuing under the old one.
  destroySessionsFor(result.userId);
  redirect('/login?toast=' + encodeURIComponent('Password changed. Sign in with your new password.'));
}

export default async function Recover({
  searchParams,
}: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;

  return (
    <div className="auth-split">
      <div className="auth-brand">
        <div className="auth-brand-inner">
          <span className="brand-logo">RC</span>
          <p className="inst">University of Eswatini</p>
          <p className="unit">Department of Computer Science</p>
          <h2>Locked out</h2>
          <p className="tagline">
            Sign-in here is local to the department, so there is no external account to
            recover through. The project coordinator issues you a short code in person or
            on a number they already hold for you, and you choose the new password yourself.
          </p>
          <ul className="brand-points">
            <li>The coordinator never sees your password</li>
            <li>The code works once and expires after 30 minutes</li>
            <li>Changing your password signs out every device</li>
          </ul>
          <p className="brand-foot">Ask the coordinator for a code before you start.</p>
        </div>
      </div>

      <div className="auth-main">
        <div className="auth-main-inner">
          <div className="crest">
            <p className="inst">University of Eswatini</p>
            <p className="unit">Reset your password</p>
          </div>

          {e && <div className="notice bad" role="alert">{e}</div>}

          <form action={recover}>
            <p>
              <label htmlFor="username">Username or student number</label>
              <input id="username" name="username" type="text" autoComplete="username" required />
            </p>
            <p>
              <label htmlFor="code">Reset code</label>
              <input id="code" name="code" type="text" placeholder="e.g. K4P-7HM-2QX"
                     autoComplete="one-time-code" spellCheck={false} required />
            </p>
            <p>
              <label htmlFor="password">New password</label>
              <input id="password" name="password" type="password" autoComplete="new-password"
                     minLength={PASSWORD_POLICY.minLength} required />
              <span className="muted" style={{ fontSize: 12.5 }}>
                At least {PASSWORD_POLICY.minLength} characters. Length does more than symbols do,
                so a phrase you will remember beats a short password with punctuation in it.
              </span>
            </p>
            <p>
              <label htmlFor="confirm">New password again</label>
              <input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
            </p>
            <p style={{ marginTop: 18 }}>
              <button className="btn" type="submit">Set my password</button>
              <a href="/login" style={{ marginLeft: 14, fontSize: 13.5 }}>Back to sign in</a>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
