import { redirect, unstable_rethrow } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FlashToast } from '@/components/flash-toast';
import { resolveFlashes } from '@/lib/flash';
import { currentPrincipal } from '@/lib/auth/current';
import { can } from '@/lib/rbac/policy';
import { getInstitution, saveInstitution, type InstitutionProfile } from '@/lib/institution';
import { saveLogoFile } from '@/lib/logo-storage';
import { getEmailSettings, saveEmailSettings, type EmailProvider } from '@/lib/email-config';
import { TestEmail } from '@/components/test-email';
import { EmailSettingsFields } from '@/components/email-settings-fields';
import { JoinLink } from '@/components/join-link';
import { findPerson } from '@/lib/data/store';
import {
  listCycles, createCycle, updateCycle, setCurrentCycle, deleteCycle, canManageCycles,
} from '@/lib/cycles';
import { DeleteCycleButton } from '@/components/delete-cycle-button';

export const dynamic = 'force-dynamic';

function parseDate(value: string): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function cycleGate() {
  const p = await currentPrincipal();
  if (!p) redirect('/login');
  if (!canManageCycles(p)) redirect('/settings?e=' + encodeURIComponent('Not permitted'));
  return p;
}

async function createCycleAction(formData: FormData) {
  'use server';
  const p = await cycleGate();
  const startsOn = parseDate(String(formData.get('startsOn') ?? ''));
  const endsOn = parseDate(String(formData.get('endsOn') ?? ''));
  if (!startsOn || !endsOn) redirect('/settings?e=' + encodeURIComponent('Give the cycle a start and end date.'));
  const r = await createCycle(p.tenantId, p.tenantId, {
    label: String(formData.get('label') ?? '').trim(),
    startsOn, endsOn,
    isCurrent: formData.get('isCurrent') === 'on',
  });
  if (!r.ok) redirect(`/settings?e=${encodeURIComponent(r.error)}`);
  revalidatePath('/settings');
  redirect('/settings?saved=1');
}

async function updateCycleAction(formData: FormData) {
  'use server';
  const p = await cycleGate();
  const id = String(formData.get('id') ?? '');
  const startsOn = parseDate(String(formData.get('startsOn') ?? ''));
  const endsOn = parseDate(String(formData.get('endsOn') ?? ''));
  if (!startsOn || !endsOn) redirect('/settings?e=' + encodeURIComponent('Give the cycle a start and end date.'));
  const r = await updateCycle(p.tenantId, id, { startsOn, endsOn });
  if (!r.ok) redirect(`/settings?e=${encodeURIComponent(r.error)}`);
  revalidatePath('/settings');
  redirect('/settings?saved=1');
}

async function setCurrentCycleAction(formData: FormData) {
  'use server';
  const p = await cycleGate();
  const r = await setCurrentCycle(p.tenantId, String(formData.get('id') ?? ''));
  if (!r.ok) redirect(`/settings?e=${encodeURIComponent(r.error)}`);
  revalidatePath('/settings');
  redirect('/settings?saved=1');
}

async function deleteCycleAction(formData: FormData) {
  'use server';
  const p = await cycleGate();
  const r = await deleteCycle(p.tenantId, String(formData.get('id') ?? ''));
  if (!r.ok) redirect(`/settings?e=${encodeURIComponent(r.error)}`);
  revalidatePath('/settings');
  redirect('/settings?saved=1');
}

async function save(formData: FormData) {
  'use server';
  const p = await currentPrincipal();
  if (!p) redirect('/login');
  if (!can(p, 'config.edit').allow) redirect('/settings?e=' + encodeURIComponent('Not permitted'));

  try {
    const patch: Partial<InstitutionProfile> = {
      name: String(formData.get('name') ?? '').trim(),
      location: String(formData.get('location') ?? '').trim(),
      department: String(formData.get('department') ?? '').trim(),
      productName: String(formData.get('productName') ?? '').trim(),
      monogram: String(formData.get('monogram') ?? '').trim(),
      accentColor: String(formData.get('accentColor') ?? '#6633E6').trim(),
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
  } catch (error) {
    unstable_rethrow(error);
    console.error('[settings] save institution failed', error);
    redirect('/settings?e=' + encodeURIComponent('Could not save your changes. Please try again.'));
  }
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
  const { flashes, keys } = resolveFlashes({ e, ok, saved }, {
    saved: { resolve: () => ({ message: 'Saved.', variant: 'success' }) },
    ok: { resolve: (p) => ({ message: p.ok!, variant: 'success' }) },
    e: { resolve: (p) => ({ message: p.e!, variant: 'error' }) },
  });
  const inst = await getInstitution();
  const email = await getEmailSettings();
  const cycles = await listCycles(principal.tenantId);

  return (
    <>
      <h1 className="page">Institution settings</h1>
      <p className="lede">
        Your institution's identity, email delivery, and the academic cycles everything else hangs
        from. Changes apply across the whole workspace immediately.
      </p>

      <FlashToast flashes={flashes} keys={keys} />

      {principal.tenantId !== 'default' && (
        <section className="box" style={{ maxWidth: 560, marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>Share your institution</h2>
          <p className="muted" style={{ fontSize: 12.5, margin: '0 0 14px' }}>
            Invite students and staff to join {inst.name || principal.tenantId}. Anyone with this
            link can register against your institution.
          </p>
          <JoinLink slug={principal.tenantId} institutionName={inst.name || principal.tenantId} />
        </section>
      )}

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
            <Input name="accentColor" type="color" defaultValue={inst.accentColor || '#6633E6'} style={{ width: 60, height: 40, padding: 2 }} />
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

      <div className="box" style={{ maxWidth: 640, marginTop: 24 }}>
        <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>Academic cycles</h2>
        <p className="muted" style={{ fontSize: 12.5, margin: '0 0 14px' }}>
          The current cycle scopes role grants and deadlines for everyone. Labels are fixed once
          created. A cycle can only be deleted once nothing refers to it — role grants, deadlines,
          presentation sessions and marks must be moved or removed first.
        </p>

        {cycles.length === 0 && (
          <div className="empty" style={{ marginBottom: 18 }}>
            <strong>No cycles yet</strong>
            Create your first cycle below — for example 2025/2026, running 1 August 2025 to
            31 July 2026.
          </div>
        )}
        <ul style={{ listStyle: 'none', margin: '0 0 18px', padding: 0 }}>
          {cycles.map((c) => (
            <li key={c.id} style={{
              padding: '14px 0', borderBottom: '1px solid var(--rule)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <strong className="mono" style={{ fontSize: 14 }}>{c.label}</strong>
                {c.isCurrent ? <Badge variant="success">Current</Badge> : <Badge>Past</Badge>}
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {new Date(c.startsOn).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}
                  {' – '}
                  {new Date(c.endsOn).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}
                </span>
              </div>
              <form action={updateCycleAction} style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'end' }}>
                <input type="hidden" name="id" value={c.id} />
                <label className="field" style={{ margin: 0 }}>
                  <span className="field-label">Starts</span>
                  <Input name="startsOn" type="date" defaultValue={c.startsOn.slice(0, 10)} />
                </label>
                <label className="field" style={{ margin: 0 }}>
                  <span className="field-label">Ends</span>
                  <Input name="endsOn" type="date" defaultValue={c.endsOn.slice(0, 10)} />
                </label>
                <Button type="submit" variant="outline">Save dates</Button>
              </form>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {!c.isCurrent && (
                  <form action={setCurrentCycleAction} style={{ marginTop: 10 }}>
                    <input type="hidden" name="id" value={c.id} />
                    <Button type="submit" variant="outline">Make current</Button>
                  </form>
                )}
                {!c.isCurrent && <DeleteCycleButton id={c.id} label={c.label} action={deleteCycleAction} />}
              </div>
            </li>
          ))}
        </ul>

        <form action={createCycleAction} className="form-grid" style={{ borderTop: '1px solid var(--rule)', paddingTop: 16 }}>
          <label className="field">
            <span className="field-label">New cycle label</span>
            <Input name="label" type="text" required placeholder="e.g. 2026/2027" />
          </label>
          <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'end' }}>
            <input name="isCurrent" type="checkbox" style={{ width: 16, accentColor: 'var(--accent)' }} />
            <span className="field-label" style={{ marginBottom: 0 }}>Make this the current cycle</span>
          </label>
          <label className="field">
            <span className="field-label">Starts</span>
            <Input name="startsOn" type="date" required />
          </label>
          <label className="field">
            <span className="field-label">Ends</span>
            <Input name="endsOn" type="date" required />
          </label>
          <div>
            <Button type="submit">Add cycle</Button>
          </div>
        </form>
      </div>
    </>
  );
}
