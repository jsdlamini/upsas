import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/lib/auth/current';
import { listTenants, setTenantSuspension } from '@/lib/tenant-provisioning';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

async function suspendAction(formData: FormData) {
  'use server';
  const slug = String(formData.get('slug') ?? '');
  if (slug && slug !== 'default') await setTenantSuspension(slug, true);
  redirect('/admin');
}

async function reactivateAction(formData: FormData) {
  'use server';
  const slug = String(formData.get('slug') ?? '');
  if (slug) await setTenantSuspension(slug, false);
  redirect('/admin');
}

export default async function AdminPage() {
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');
  const isHost = principal.tenantId === 'default' && principal.roles.includes('ADMINISTRATOR');
  if (!isHost) redirect('/');

  const tenants = await listTenants();

  return (
    <main style={{ padding: '32px 24px', maxWidth: 960, margin: '0 auto' }}>
      <h1 className="page">Institutions</h1>
      <p className="lede">Host console — every tenant on the platform.</p>

      <div style={{ display: 'flex', gap: 12, margin: '20px 0' }}>
        <a href="/signup"><Button variant="outline" type="button">Create an institution</Button></a>
      </div>

      <table className="roster">
        <thead>
          <tr>
            <th>Institution</th>
            <th>Slug</th>
            <th>Users</th>
            <th>Created</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {tenants.map((t) => (
            <tr key={t.id}>
              <td><strong>{t.name}</strong></td>
              <td className="mono">{t.id}</td>
              <td>{t.users}</td>
              <td>{t.createdAt.slice(0, 10)}</td>
              <td>
                {t.suspendedAt
                  ? <span className="badge warning">Suspended</span>
                  : <span className="badge">Active</span>}
              </td>
              <td style={{ textAlign: 'right' }}>
                {t.id !== 'default' && (
                  t.suspendedAt
                    ? (
                      <form action={reactivateAction} style={{ display: 'inline' }}>
                        <input type="hidden" name="slug" value={t.id} />
                        <Button type="submit" variant="outline">Reactivate</Button>
                      </form>
                    )
                    : (
                      <form action={suspendAction} style={{ display: 'inline' }}>
                        <input type="hidden" name="slug" value={t.id} />
                        <Button type="submit" variant="outline">Suspend</Button>
                      </form>
                    )
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
