import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { currentPrincipal } from '@/lib/auth/current';
import { findPerson, updatePersonProfile, passwordHashFor } from '@/lib/data/store';
import { syncOneUserToPrisma } from '@/lib/auth/prisma-auth';

export const dynamic = 'force-dynamic';

async function save(formData: FormData) {
  'use server';
  const p = await currentPrincipal();
  if (!p) redirect('/login');
  const res = updatePersonProfile(p.userId, {
    fullName: String(formData.get('fullName') ?? '').trim(),
    surname: String(formData.get('surname') ?? '').trim(),
    email: String(formData.get('email') ?? '').trim(),
  });
  const person = findPerson(p.userId);
  if (person) {
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
  const person = findPerson(principal.userId);
  if (!person) redirect('/login');
  const { e, saved } = await searchParams;

  return (
    <>
      <h1 className="page">My account</h1>
      <p className="lede">
        Signed in as <span className="mono">{person.username}</span>
        {person.studentId ? ` (student ${person.username})` : ''}. These details appear on meeting notices, results and emails.
      </p>

      {saved && <div className="notice">Saved.</div>}
      {e && <div className="notice bad">{e}</div>}

      <div className="box" style={{ maxWidth: 460 }}>
        <form action={save} style={{ display: 'grid', gap: 10 }}>
          <label className="field">
            <span className="field-label">Full name</span>
            <Input name="fullName" defaultValue={person.fullName} placeholder="e.g. Nkambule, Liyandza Sihle" />
          </label>
          <label className="field">
            <span className="field-label">Surname</span>
            <Input name="surname" defaultValue={person.surname} placeholder="Surname" />
          </label>
          <label className="field">
            <span className="field-label">Email</span>
            <Input name="email" type="email" defaultValue={person.email ?? ''} placeholder="you@example.com" />
          </label>
          <div>
            <Button>Save</Button>
          </div>
        </form>
      </div>
    </>
  );
}
