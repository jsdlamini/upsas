import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getInstitution, isConfigured, saveInstitution, type InstitutionProfile } from '@/lib/institution';
import { saveLogoFile } from '@/lib/logo-storage';

export const dynamic = 'force-dynamic';

async function save(formData: FormData) {
  'use server';
  if (isConfigured()) redirect('/');

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
  if (!res.ok) redirect(`/setup?e=${encodeURIComponent(res.error)}`);
  revalidatePath('/', 'layout');
  redirect('/');
}

export default async function Setup({
  searchParams,
}: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  if (isConfigured()) redirect('/');
  const inst = getInstitution();

  return (
    <main className="setup-page">
      <div className="setup-card">
        <h1>Set up your institution</h1>
        <p className="muted">
          This runs once, before anyone signs in. You can change everything later from Settings.
        </p>

        {e && <div className="notice bad">{e}</div>}

        <form action={save} className="setup-form">
          <label className="field">
            <span className="field-label">Institution name</span>
            <Input name="name" defaultValue={inst.name} placeholder="e.g. University of Eswatini" required />
          </label>
          <label className="field">
            <span className="field-label">Location / campus</span>
            <Input name="location" defaultValue={inst.location} placeholder="e.g. Kwaluseni" />
          </label>
          <label className="field">
            <span className="field-label">Department / school</span>
            <Input name="department" defaultValue={inst.department} placeholder="e.g. Department of Computer Science" required />
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
          <div>
            <Button type="submit">Save and continue</Button>
          </div>
        </form>
      </div>
    </main>
  );
}
