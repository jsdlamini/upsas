import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FlashToast } from '@/components/flash-toast';
import { resolveFlashes } from '@/lib/flash';
import { currentPrincipal, identityFor } from '@/lib/auth/current';
import { findPerson, updatePersonProfile, passwordHashFor } from '@/lib/data/store';
import { syncOneUserToPrisma, updateUserProfilePrisma } from '@/lib/auth/prisma-auth';

export const dynamic = 'force-dynamic';

async function save(formData: FormData) {
  'use server';
  const p = await currentPrincipal();
  if (!p) redirect('/login');
  const patch = {
    fullName: String(formData.get('fullName') ?? '').trim(),
    surname: String(formData.get('surname') ?? '').trim(),
    email: String(formData.get('email') ?? '').trim(),
  };
  const person = findPerson(p.userId);
  const res = person ? updatePersonProfile(p.userId, patch) : await updateUserProfilePrisma(p.userId, patch);
  if (person && res.ok) {
    try {
      await syncOneUserToPrisma(person, await passwordHashFor(person.username));
    } catch { /* best-effort */ }
  }
  revalidatePath('/account');
  redirect(`/account?${res.ok ? 'saved=1' : `e=${encodeURIComponent(res.error)}`}`);
}

export default async function Account({
  searchParams,
}: { searchParams: Promise<{ e?: string; saved?: string }> }) {
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');
  const identity = await identityFor(principal.userId);
  if (!identity) redirect('/login');
  const { e, saved } = await searchParams;
  const { flashes, keys } = resolveFlashes({ e, saved }, {
    saved: { resolve: () => ({ message: 'Saved.', variant: 'success' }) },
    e: { resolve: (p) => ({ message: p.e!, variant: 'error' }) },
  });

  return (
    <>
      <h1 className="page">My account</h1>
      <p className="lede">
        Signed in as <span className="mono">{identity.username}</span>
        {identity.studentId ? ' (student)' : ''}. These details appear on meeting notices, results and emails.
      </p>

      <FlashToast flashes={flashes} keys={keys} />

      <div className="box" style={{ maxWidth: 460 }}>
        <form action={save} style={{ display: 'grid', gap: 10 }}>
          <label className="field">
            <span className="field-label">Full name</span>
            <Input name="fullName" defaultValue={identity.fullName} placeholder="e.g. Nkambule, Liyandza Sihle" />
          </label>
          <label className="field">
            <span className="field-label">Surname</span>
            <Input name="surname" defaultValue={identity.surname} placeholder="Surname" />
          </label>
          <label className="field">
            <span className="field-label">Email</span>
            <Input name="email" type="email" defaultValue={identity.email ?? ''} placeholder="you@example.com" />
          </label>
          <div>
            <Button>Save</Button>
          </div>
        </form>
      </div>
    </>
  );
}
