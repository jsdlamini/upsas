import { redirect } from 'next/navigation';
import { createTenant } from '@/lib/tenant-provisioning';
import { getInstitution, monogramText, logoUrl } from '@/lib/institution';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

async function signupAction(formData: FormData) {
  'use server';
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  if (password !== confirm) {
    redirect('/signup?e=' + encodeURIComponent('Passwords do not match.'));
  }
  const r = await createTenant({
    name: String(formData.get('name') ?? ''),
    slug: String(formData.get('slug') ?? ''),
    adminName: String(formData.get('adminName') ?? ''),
    adminSurname: String(formData.get('adminSurname') ?? ''),
    adminEmail: String(formData.get('adminEmail') ?? ''),
    adminUsername: String(formData.get('adminUsername') ?? ''),
    adminPassword: password,
  });
  if (!r.ok) redirect('/signup?e=' + encodeURIComponent(r.error));
  redirect('/login?created=' + encodeURIComponent(r.tenantId));
}

export default async function SignupPage({
  searchParams,
}: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  const inst = await getInstitution();
  const mono = await monogramText();
  const logo = await logoUrl();

  return (
    <main className="auth-shell">
      <aside className="auth-brand">
        <div className="auth-brand-head">
          {logo
            ? <img src={logo} alt="" className="auth-logo" />
            : <span className="auth-monogram">{mono}</span>}
          <span className="auth-product">{inst.productName || 'Research Chain'}</span>
        </div>
        <div className="auth-brand-copy">
          <h1>Set up your institution</h1>
          <p>
            Create your own private workspace. You will be its administrator —
            configure branding, add staff, and invite students.
          </p>
        </div>
      </aside>

      <section className="auth-panel">
        <h2 className="page">New institution</h2>
        {e && <div className="notice" role="alert">{e}</div>}

        <form action={signupAction} className="stack">
          <label>Institution name
            <input name="name" type="text" autoComplete="organization" required placeholder="e.g. Coastline University" />
          </label>

          <label>Workspace slug
            <input name="slug" type="text" pattern="[a-z0-9-]{2,40}" autoComplete="off" required
                   placeholder="coastline" title="Lowercase letters, numbers and hyphens." />
            <span className="muted mono">Lowercase letters, numbers and hyphens.</span>
          </label>

          <hr />

          <label>Administrator name
            <input name="adminName" type="text" autoComplete="given-name" required />
          </label>
          <label>Administrator surname
            <input name="adminSurname" type="text" autoComplete="family-name" required />
          </label>
          <label>Administrator email
            <input name="adminEmail" type="email" autoComplete="email" required />
          </label>
          <label>Administrator username
            <input name="adminUsername" type="text" autoComplete="username" required />
          </label>
          <label>Password
            <input name="password" type="password" autoComplete="new-password" required minLength={8} />
          </label>
          <label>Confirm password
            <input name="confirm" type="password" autoComplete="new-password" required minLength={8} />
          </label>

          <Button type="submit">Create my institution</Button>
        </form>

        <p className="muted" style={{ marginTop: 16 }}>
          Already have an account? <a href="/login">Sign in</a>
        </p>
      </section>
    </main>
  );
}
