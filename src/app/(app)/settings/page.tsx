import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { currentPrincipal } from '@/lib/auth/current';
import { can } from '@/lib/rbac/policy';
import { getInstitution, saveInstitution, type InstitutionProfile } from '@/lib/institution';
import { saveLogoFile } from '@/lib/logo-storage';

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

  const res = saveInstitution(patch);
  if (!res.ok) redirect(`/settings?e=${encodeURIComponent(res.error)}`);
  revalidatePath('/settings');
  revalidatePath('/', 'layout');
  redirect('/settings?saved=1');
}

export default async function Settings({
  searchParams,
}: { searchParams: Promise<{ e?: string; saved?: string }> }) {
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

  const { e, saved } = await searchParams;
  const inst = getInstitution();

  return (
    <>
      <h1 className="page">Institution settings</h1>
      <p className="lede">Branding shown across the app, emails, iCal feeds and PDFs.</p>

      {saved && <div className="notice">Saved.</div>}
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
          <div>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </div>
    </>
  );
}
