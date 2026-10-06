import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { redeemResetCode, requestResetCode } from '@/lib/data/store';
import { getInstitution, monogramText, logoUrl } from '@/lib/institution';
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

async function requestReset(formData: FormData) {
  'use server';
  const username = String(formData.get('username') ?? '');
  await requestResetCode(username);
  const carry = username.trim() ? `&u=${encodeURIComponent(username.trim())}` : '';
  redirect(`/recover?sent=1${carry}`);
}

export default async function Recover({
  searchParams,
}: { searchParams: Promise<{ e?: string; u?: string; sent?: string }> }) {
  const { e, u, sent } = await searchParams;
  const inst = await getInstitution();
  const mono = await monogramText();
  const logo = await logoUrl();

  return (
    <div className="auth-split">
      <div className="auth-brand">
        <div className="auth-brand-inner">
          {logo ? <img src={logo} alt="" className="brand-logo-img" /> : <span className="brand-logo">{mono}</span>}
          <p className="inst">{inst.name}</p>
          <p className="unit">{inst.department}</p>
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
            <p className="inst">{inst.name}</p>
            <p className="unit">Reset your password</p>
          </div>

          {e && <div className="notice bad" role="alert">{e}</div>}
          {sent && <div className="notice" role="status">If that account has an email on file, a reset code has been sent. Check your inbox.</div>}

          <form action={requestReset}>
            <p>
              <label htmlFor="req-username">Email</label>
              <input id="req-username" name="username" type="email" autoComplete="email" defaultValue={u ?? ''} required />
            </p>
            <p style={{ marginTop: 12 }}>
              <Button type="submit" variant="outline">Email me a reset code</Button>
            </p>
          </form>

          <hr style={{ margin: '22px 0', border: 0, borderTop: '1px solid var(--rule)' }} />
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>Already have a code? Reset your password below.</p>

          <form action={recover}>
            <p>
              <label htmlFor="username">Email</label>
              <input id="username" name="username" type="email" autoComplete="email" defaultValue={u ?? ''} required />
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
              <Button type="submit">Set my password</Button>
              <a href="/login" style={{ marginLeft: 14, fontSize: 13.5 }}>Back to sign in</a>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
