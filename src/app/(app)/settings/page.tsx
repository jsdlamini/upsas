import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { currentPrincipal } from '@/lib/auth/current';
import { can } from '@/lib/rbac/policy';
import { getInstitution, saveInstitution, type InstitutionProfile } from '@/lib/institution';
import { saveLogoFile } from '@/lib/logo-storage';
import { getEmailSettings, saveEmailSettings, type EmailProvider } from '@/lib/email-config';
import { TestEmail } from '@/components/test-email';
import { EmailSettingsFields } from '@/components/email-settings-fields';
import { findPerson } from '@/lib/data/store';

export const dynamic = 'force-dynamic';

async function save(formData: FormData) {
  'use server';
  const p = await currentPrincipal();
  if (!p) redirect('/login');
  if (!can(p, 'config.edit').allow) redirect('/settings?e=Not+permitted');

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
  if (!res.ok) redirect(`/settings?e=${encodeURIComponent(res.error)}`);

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
  if (!emailRes.ok) redirect(`/settings?e=${encodeURIComponent(emailRes.error)}`);

  revalidatePath('/settings');
  revalidatePath('/', 'layout');
  redirect('/settings?saved=1');
}

export default async function Settings({
  searchParams,
}: { searchParams: Promise<{ e?: string; ok?: string; saved?: string }> }) {
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');
  const gate = can(principal, 'config.edit', {});
  if (!gate.allow) {
    return (
      <>
        <h1 className="page">Not permitted</h1>
        <p className="lede">{gate.reason} Institution settings are managed by the coordinator.</p>
      </>
    );
  }

  const { e, ok, saved } = await searchParams;
  const inst = await getInstitution();
  const email = await getEmailSettings();

  return (
    <>
      <h1 className="page">Institution settings</h1>
      <p className="lede">Branding shown across the app, emails, iCal feeds and PDFs.</p>

      {saved && <div className="notice">Saved.</div>}
      {ok && <div className="notice">{ok}</div>}
      {e && <div className="notice bad">{e}</div>}

      <div className="box" style={{ maxWidth: 560 }}>
        <form action={save} className="setup-form">
          <label className="field">
            <span className="field-label">Institution name</span>
            <Input name="name" defaultValue={inst.name} required />
          </label>
          <label className="field">
            <span className="field-label">Location / campus</span>
            <Input name="location" defaultValue={inst.location} />
          </label>
          <label className="field">
            <span className="field-label">Department / school</span>
            <Input name="department" defaultValue={inst.department} required />
          </label>
          <label className="field">
            <span className="field-label">Product name</span>
            <Input name="productName" defaultValue={inst.productName || 'Research Chain'} />
          </label>
          <label className="field">
            <span className="field-label">Monogram (2–4 letters)</span>
            <Input name="monogram" defaultValue={inst.monogram} maxLength={4} />
          </label>
          <label className="field">
            <span className="field-label">Accent colour</span>
            <Input name="accentColor" type="color" defaultValue={inst.accentColor || '#2E5AC8'} style={{ width: 60, height: 40, padding: 2 }} />
          </label>
          <div className="field">
            <span className="field-label">Logo</span>
            <Input name="logoFile" type="file" accept="image/*" />
            <span className="muted" style={{ display: 'block', margin: '6px 0' }}>…or paste a URL</span>
            <Input name="logoUrl" type="url" defaultValue={inst.logo?.kind === 'url' ? inst.logo.url : ''} placeholder="https://…/logo.png" />
          </div>

          <hr style={{ margin: '8px 0 18px', border: 0, borderTop: '1px solid var(--rule)' }} />
          <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>Email</h2>
          <p className="muted" style={{ fontSize: 12.5, margin: '0 0 14px' }}>
            Resend, any SMTP server, or none. Full guide in <code>docs/email-setup.md</code>.
          </p>
          <EmailSettingsFields email={email} defaultFromName={inst.productName || 'Research Chain'} />

          <div>
            <Button type="submit">Save</Button>
          </div>
        </form>

        <TestEmail defaultTo={findPerson(principal.userId)?.email ?? ''} />
      </div>
    </>
  );
}
