import { redirect } from 'next/navigation';
import { createTenant } from '@/lib/tenant-provisioning';
import { getInstitution, monogramText, logoUrl } from '@/lib/institution';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
    <div className="auth-split">
      <aside className="auth-brand">
        <div className="auth-brand-inner ui-enter">
          {logo ? <img src={logo} alt="" className="brand-logo-img" /> : <div className="brand-logo">{mono}</div>}
          <p className="inst">{[inst.name, inst.location].filter(Boolean).join(', ')}</p>
          <p className="unit">{inst.department}</p>
          <h2>Set up your institution</h2>
          <p className="tagline">
            Create a private workspace for your institution. You become its
            administrator — configure branding, add staff and invite students.
          </p>
          <div className="brand-foot">Accounts held locally — no external sign-in</div>
        </div>
      </aside>

      <div className="auth-main">
        <div className="auth-main-inner ui-enter">
          <div className="crest">
            <p className="inst">{[inst.name, inst.location].filter(Boolean).join(', ')}</p>
            <p className="unit">{inst.department} — Research project supervision</p>
          </div>
          <h1 className="page">New institution</h1>
          {e && <div className="notice bad" role="alert">{e}</div>}

          <form action={signupAction} className="setup-form">
            <label className="field">
              <span className="field-label">Institution name</span>
              <Input name="name" type="text" autoComplete="organization" required placeholder="e.g. Coastline University" />
            </label>

            <label className="field">
              <span className="field-label">Workspace slug</span>
              <Input name="slug" type="text" pattern="[a-z0-9-]{2,40}" autoComplete="off" required
                     placeholder="coastline" title="Lowercase letters, numbers and hyphens." />
              <span className="muted mono" style={{ display: 'block', marginTop: 6, fontSize: 12 }}>
                Lowercase letters, numbers and hyphens.
              </span>
            </label>

            <hr style={{ margin: '4px 0 16px', border: 0, borderTop: '1px solid var(--rule)' }} />
            <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>Administrator</h2>

            <label className="field">
              <span className="field-label">Name</span>
              <Input name="adminName" type="text" autoComplete="given-name" required />
            </label>
            <label className="field">
              <span className="field-label">Surname</span>
              <Input name="adminSurname" type="text" autoComplete="family-name" required />
            </label>
            <label className="field">
              <span className="field-label">Email</span>
              <Input name="adminEmail" type="email" autoComplete="email" required />
            </label>
            <label className="field">
              <span className="field-label">Username</span>
              <Input name="adminUsername" type="text" autoComplete="username" required />
            </label>
            <label className="field">
              <span className="field-label">Password</span>
              <Input name="password" type="password" autoComplete="new-password" required minLength={8} />
            </label>
            <label className="field">
              <span className="field-label">Confirm password</span>
              <Input name="confirm" type="password" autoComplete="new-password" required minLength={8} />
            </label>

            <div>
              <Button type="submit">Create my institution</Button>
            </div>
          </form>

          <p className="muted" style={{ marginTop: 16 }}>
            Already have an account? <a href="/login">Sign in</a>
          </p>
        </div>
      </div>
    </div>
  );
}
