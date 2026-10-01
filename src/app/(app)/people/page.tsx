import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { currentPrincipal } from '@/lib/auth/current';
import { can } from '@/lib/rbac/policy';
import type { RoleCode } from '@/lib/rbac/policy';
import {
  allPeople, findPerson, setPersonRoles, updatePersonProfile,
  pendingStaffRequests, approveStaffAccount, declineStaffAccount,
  passwordHashFor,
} from '@/lib/data/store';
import { syncOneUserToPrisma } from '@/lib/auth/prisma-auth';

export const dynamic = 'force-dynamic';

const ALL_ROLES: RoleCode[] = [
  'STUDENT', 'SUPERVISOR', 'ASSESSOR', 'MODERATOR', 'COORDINATOR', 'EXTERNAL_EXAMINER', 'ADMINISTRATOR',
];

async function syncPerson(id: string): Promise<void> {
  const person = findPerson(id);
  if (!person) return;
  try {
    await syncOneUserToPrisma(person, await passwordHashFor(person.username));
  } catch {
    /* best-effort: the in-memory store is authoritative for the session */
  }
}

async function setRoles(formData: FormData) {
  'use server';
  const p = await currentPrincipal();
  if (!p) redirect('/login');
  if (!can(p, 'user.approve').allow) redirect('/people?e=Not+permitted');
  const id = String(formData.get('id') ?? '');
  const roles = ALL_ROLES.filter((r) => formData.get(`role-${r}`) === 'on');
  const res = setPersonRoles(id, roles);
  await syncPerson(id);
  revalidatePath('/people');
  redirect(`/people?${res.ok ? 'saved=1' : `e=${encodeURIComponent(res.error)}`}`);
}

async function saveProfile(formData: FormData) {
  'use server';
  const p = await currentPrincipal();
  if (!p) redirect('/login');
  const id = String(formData.get('id') ?? '');
  const own = p.userId === id;
  if (!own && !can(p, 'user.approve').allow) redirect('/people?e=Not+permitted');
  const res = updatePersonProfile(id, {
    fullName: String(formData.get('fullName') ?? ''),
    surname: String(formData.get('surname') ?? ''),
    email: String(formData.get('email') ?? ''),
  });
  await syncPerson(id);
  revalidatePath('/people');
  revalidatePath('/account');
  redirect(`${own ? '/account' : '/people'}?${res.ok ? 'saved=1' : `e=${encodeURIComponent(res.error)}`}`);
}

async function approve(formData: FormData) {
  'use server';
  const p = await currentPrincipal();
  if (!p) redirect('/login');
  if (!can(p, 'user.approve').allow) redirect('/people?e=Not+permitted');
  const id = String(formData.get('id') ?? '');
  approveStaffAccount(id);
  await syncPerson(id);
  revalidatePath('/people');
  redirect('/people?approved=1');
}

async function decline(formData: FormData) {
  'use server';
  const p = await currentPrincipal();
  if (!p) redirect('/login');
  if (!can(p, 'user.approve').allow) redirect('/people?e=Not+permitted');
  declineStaffAccount(String(formData.get('id') ?? ''));
  revalidatePath('/people');
  redirect('/people?declined=1');
}

export default async function People({
  searchParams,
}: { searchParams: Promise<{ e?: string; saved?: string; approved?: string; declined?: string }> }) {
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');
  const gate = can(principal, 'user.approve', {});
  if (!gate.allow) {
    return (
      <>
        <h1 className="page">Not permitted</h1>
        <p className="lede">{gate.reason} Account approval and roles are managed by the coordinator.</p>
      </>
    );
  }

  const { e, saved, approved, declined } = await searchParams;
  const people = allPeople();
  const requests = pendingStaffRequests();

  return (
    <>
      <h1 className="page">People</h1>
      <p className="lede">
        Approve staff, change roles, and correct names. Role changes apply immediately — no re-login needed.
      </p>

      {saved && <div className="notice">Saved.</div>}
      {approved && <div className="notice">Account activated — that staff member can now sign in.</div>}
      {declined && <div className="notice">Request declined.</div>}
      {e && <div className="notice bad">{e}</div>}

      {requests.length > 0 && (
        <div className="box">
          <strong>Account requests</strong>
          <div className="table-wrap">
            <table className="list" style={{ marginTop: 10 }}>
              <thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Requested roles</th><th></th></tr></thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.fullName}</strong></td>
                    <td className="mono">{r.username}</td>
                    <td className="muted">{r.email}</td>
                    <td className="muted">{r.requestedRoles?.map((x) => x.toLowerCase()).join(', ')}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <form action={approve} style={{ display: 'inline' }}>
                        <input type="hidden" name="id" value={r.id} />
                        <Button style={{ padding: '3px 10px', fontSize: 12 }}>Approve</Button>
                      </form>{' '}
                      <form action={decline} style={{ display: 'inline' }}>
                        <input type="hidden" name="id" value={r.id} />
                        <Button variant="outline" style={{ padding: '3px 10px', fontSize: 12 }}>Decline</Button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table className="list" style={{ marginTop: 8 }}>
          <thead>
            <tr><th style={{ width: '24%' }}>Person</th><th>Roles</th><th style={{ width: '12%' }}></th></tr>
          </thead>
          <tbody>
            {people.map((person) => {
              const roles = person.grants.map((g) => g.role);
              const pending = person.status === 'PENDING_APPROVAL';
              return (
                <tr key={person.id}>
                  <td>
                    <strong>{person.fullName}</strong>
                    {person.surname && <span className="muted"> ({person.surname})</span>}
                    <div className="muted" style={{ fontSize: 12 }}>
                      <span className="mono">{person.username}</span>
                      {person.email ? <> · {person.email}</> : <span className="bad"> · no email</span>}
                    </div>
                    {pending && <Badge variant="warning" style={{ marginTop: 4 }}>pending approval</Badge>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {roles.length === 0
                        ? <span className="muted">none</span>
                        : roles.map((r) => <Badge key={r} variant="success">{r.toLowerCase()}</Badge>)}
                    </div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <details>
                      <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Manage</summary>
                      <div className="box" style={{ marginTop: 8, textAlign: 'left' }}>
                        <form action={setRoles}>
                          <input type="hidden" name="id" value={person.id} />
                          <strong style={{ fontSize: 13 }}>Roles</strong>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '6px 0 10px' }}>
                            {ALL_ROLES.map((r) => (
                              <label key={r} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
                                <input type="checkbox" name={`role-${r}`} defaultChecked={roles.includes(r)} />
                                {r.toLowerCase().replace('_', ' ')}
                              </label>
                            ))}
                          </div>
                          <Button style={{ padding: '4px 12px', fontSize: 12 }}>Save roles</Button>
                        </form>
                        <form action={saveProfile} style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                          <input type="hidden" name="id" value={person.id} />
                          <strong style={{ fontSize: 13 }}>Profile</strong>
                          <div style={{ display: 'grid', gap: 6, margin: '6px 0 10px' }}>
                            <Input name="fullName" defaultValue={person.fullName} placeholder="Full name" />
                            <Input name="surname" defaultValue={person.surname} placeholder="Surname" />
                            <Input name="email" type="email" defaultValue={person.email ?? ''} placeholder="Email" />
                          </div>
                          <Button variant="outline" style={{ padding: '4px 12px', fontSize: 12 }}>Save profile</Button>
                        </form>
                      </div>
                    </details>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
