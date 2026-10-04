import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getInstitution, isConfigured, saveInstitution, type InstitutionProfile } from '@/lib/institution';
import { saveLogoFile } from '@/lib/logo-storage';
import { getEmailSettings, saveEmailSettings, type EmailProvider } from '@/lib/email-config';
import { testEmail } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

async function save(formData: FormData) {
  'use server';
  if (await isConfigured()) redirect('/');

  const patch: Partial<InstitutionProfile> = {
    name: String(formData.get('name') ?? '').trim(),
    location: String(formData.get('location') ?? '').trim(),
    department: String(formData.get('department') ?? '').trim(),
    productName: String(formData.get('productName') ?? '').trim(),
    monogram: String(formData.get('monogram') ?? '').trim(),
    accentColor: String(formData.get('accentColor') ?? '#2E5AC8').trim(),
  };

  const file = formData.get('logoFile');
  const url = String(formData.get('logoUrl') ?? '').trim();
  if (file instanceof File && file.size > 0) {
    patch.logo = { kind: 'file', fileId: await saveLogoFile(new Uint8Array(await file.arrayBuffer()), file.type) };
  } else if (url) {
    patch.logo = { kind: 'url', url };
  } else {
    patch.logo = null;
  }

  const res = await saveInstitution(patch);
  if (!res.ok) redirect(`/setup?e=${encodeURIComponent(res.error)}`);

  const emailRes = await saveEmailSettings({
    provider: String(formData.get('emailProvider') ?? 'none') as EmailProvider,
    fromName: String(formData.get('fromName') ?? '').trim(),
    fromEmail: String(formData.get('fromEmail') ?? '').trim(),
    smtpHost: String(formData.get('smtpHost') ?? '').trim(),
    smtpPort: Number(formData.get('smtpPort') ?? 587),
    smtpSecure: formData.get('smtpSecure') === 'on',
    smtpUser: String(formData.get('smtpUser') ?? '').trim(),
    smtpPass: String(formData.get('smtpPass') ?? ''),
  });
  if (!emailRes.ok) redirect(`/setup?e=${encodeURIComponent(emailRes.error)}`);

  revalidatePath('/', 'layout');
  redirect('/');
}

async function sendTest(formData: FormData) {
  'use server';
  const to = String(formData.get('testTo') ?? '').trim();
  const outcome = await testEmail(to);
  const msg = outcome === 'sent' ? 'Test email sent — check the inbox.' : `Test email ${outcome}.`;
  redirect(`/setup?${outcome === 'sent' ? 'ok=' : 'e='}${encodeURIComponent(msg)}`);
}

export default async function Setup({
  searchParams,
}: { searchParams: Promise<{ e?: string; ok?: string }> }) {
  const { e, ok } = await searchParams;
  if (await isConfigured()) redirect('/');
  const inst = await getInstitution();
  const email = await getEmailSettings();

  return (
    <main className="setup-page">
      <div className="setup-card">
        <h1>Set up your institution</h1>
        <p className="muted">
          This runs once, before anyone signs in. You can change everything later from Settings.
        </p>

        {e && <div className="notice bad">{e}</div>}
        {ok && <div className="notice">{ok}</div>}

        <form action={save} className="setup-form">
          <label className="field">
            <span className="field-label">Institution name</span>
            <Input name="name" defaultValue={inst.name} placeholder="e.g. National University" required />
          </label>
          <label className="field">
            <span className="field-label">Location / campus</span>
            <Input name="location" defaultValue={inst.location} placeholder="e.g. Main campus" />
          </label>
          <label className="field">
            <span className="field-label">Department / school</span>
            <Input name="department" defaultValue={inst.department} placeholder="e.g. Department of Computing" required />
          </label>
          <label className="field">
            <span className="field-label">Product name</span>
            <Input name="productName" defaultValue={inst.productName || 'Research Chain'} placeholder="Research Chain" />
          </label>
          <label className="field">
            <span className="field-label">Monogram (2–4 letters)</span>
            <Input name="monogram" defaultValue={inst.monogram} placeholder="e.g. RC" maxLength={4} />
          </label>
          <label className="field">
            <span className="field-label">Accent colour</span>
            <Input name="accentColor" type="color" defaultValue={inst.accentColor || '#2E5AC8'} style={{ width: 60, height: 40, padding: 2 }} />
          </label>
          <div className="field">
            <span className="field-label">Logo</span>
            <Input name="logoFile" type="file" accept="image/*" />
            <span className="muted" style={{ display: 'block', margin: '6px 0' }}>…or paste a URL</span>
            <Input name="logoUrl" type="url" placeholder="https://…/logo.png" />
          </div>

          <hr style={{ margin: '8px 0 18px', border: 0, borderTop: '1px solid var(--rule)' }} />
          <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>Email</h2>
          <p className="muted" style={{ fontSize: 12.5, margin: '0 0 14px' }}>
            Resend, any SMTP server, or none. Full guide in <code>docs/email-setup.md</code>.
          </p>
          <div className="field">
            <span className="field-label">Provider</span>
            <select name="emailProvider" defaultValue={email.provider}>
              <option value="none">None (no email)</option>
              <option value="resend">Resend</option>
              <option value="smtp">SMTP</option>
            </select>
          </div>
          <label className="field">
            <span className="field-label">From name</span>
            <Input name="fromName" defaultValue={email.fromName || inst.productName || 'Research Chain'} />
          </label>
          <label className="field">
            <span className="field-label">From email</span>
            <Input name="fromEmail" type="email" defaultValue={email.fromEmail} placeholder="no-reply@your-institution.edu" />
          </label>
          <label className="field">
            <span className="field-label">SMTP host</span>
            <Input name="smtpHost" defaultValue={email.smtpHost} placeholder="smtp.example.com" />
          </label>
          <label className="field">
            <span className="field-label">SMTP port</span>
            <Input name="smtpPort" type="number" defaultValue={email.smtpPort} />
          </label>
          <label className="field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" name="smtpSecure" defaultChecked={email.smtpSecure} />
            <span style={{ fontSize: 13 }}>Use TLS (secure)</span>
          </label>
          <label className="field">
            <span className="field-label">SMTP user</span>
            <Input name="smtpUser" defaultValue={email.smtpUser} autoComplete="off" />
          </label>
          <label className="field">
            <span className="field-label">SMTP password</span>
            <Input name="smtpPass" type="password" defaultValue={email.smtpPass} autoComplete="off" />
          </label>

          <div>
            <Button type="submit">Save and continue</Button>
          </div>
        </form>

        <form action={sendTest} style={{ marginTop: 18, borderTop: '1px solid var(--rule)', paddingTop: 16 }}>
          <span className="field-label">Send a test email to</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Input name="testTo" type="email" placeholder="you@example.com" required />
            <Button variant="outline" type="submit">Send test</Button>
          </div>
        </form>
      </div>
    </main>
  );
}
