import { prisma } from './prisma';
import { hashPassword } from './auth/password';

const SLUG_RE = /^[a-z0-9-]{2,40}$/;
const RESERVED = new Set([
  'default', 'admin', 'app', 'www', 'api', 'signup', 'login', 'register',
  'recover', 'setup', 'settings', 'health', 'cohort', 'book', 'topics',
  'people', 'grading', 'marks', 'publish', 'me', 'account', 'deliverables',
]);

export type TenantSummary = {
  id: string;
  name: string;
  createdAt: string;
  suspendedAt: string | null;
  users: number;
};

export async function createTenant(input: {
  name: string;
  slug: string;
  adminName: string;
  adminSurname: string;
  adminEmail: string;
  adminUsername: string;
  adminPassword: string;
}): Promise<{ ok: true; tenantId: string } | { ok: false; error: string }> {
  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();
  const email = input.adminEmail.trim().toLowerCase();
  const username = input.adminUsername.trim().toLowerCase();
  const adminName = input.adminName.trim();
  const adminSurname = input.adminSurname.trim();

  if (name.length < 2) return { ok: false, error: 'Give the institution a name.' };
  if (!SLUG_RE.test(slug)) return { ok: false, error: 'The slug must be 2–40 lowercase letters, numbers or hyphens.' };
  if (RESERVED.has(slug)) return { ok: false, error: 'That slug is reserved.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'Enter a valid email address.' };
  if (username.length < 3 || !/^[a-z0-9._-]+$/.test(username)) return { ok: false, error: 'Username must be at least 3 letters, numbers, dots, underscores or hyphens.' };
  if (input.adminPassword.length < 8) return { ok: false, error: 'Password must be at least 8 characters.' };
  if (!adminName || !adminSurname) return { ok: false, error: 'Enter the administrator\u2019s name and surname.' };

  if (await prisma.tenant.findUnique({ where: { id: slug } })) {
    return { ok: false, error: 'That slug is already taken.' };
  }
  if (await prisma.user.findUnique({ where: { email } })) {
    return { ok: false, error: 'That email is already registered.' };
  }

  const hash = await hashPassword(input.adminPassword);
  const now = new Date();
  const userId = `u-${slug}-admin`;

  await prisma.$transaction([
    prisma.tenant.create({ data: { id: slug, name, createdAt: now } }),
    prisma.institution.create({ data: { id: slug, tenantId: slug, name, productName: name } }),
    prisma.emailSettings.create({ data: { id: slug, tenantId: slug, provider: 'none' } }),
    prisma.user.create({
      data: {
        id: userId, tenantId: slug, username, email,
        fullName: adminName, surname: adminSurname, status: 'ACTIVE',
        credential: { create: { hash } },
        roles: {
          create: [
            { role: 'COORDINATOR', cycleId: '2025/2026', grantedBy: 'signup', grantedAt: now },
            { role: 'ADMINISTRATOR', cycleId: null, grantedBy: 'signup', grantedAt: now },
          ],
        },
      },
    }),
  ]);

  return { ok: true, tenantId: slug };
}

export async function listTenants(): Promise<TenantSummary[]> {
  const [rows, users] = await Promise.all([
    prisma.tenant.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.user.findMany({ select: { tenantId: true } }),
  ]);
  const countMap = new Map<string, number>();
  for (const u of users) countMap.set(u.tenantId, (countMap.get(u.tenantId) ?? 0) + 1);
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    createdAt: t.createdAt.toISOString(),
    suspendedAt: t.suspendedAt ? t.suspendedAt.toISOString() : null,
    users: countMap.get(t.id) ?? 0,
  }));
}

export async function setTenantSuspension(slug: string, suspend: boolean): Promise<boolean> {
  const r = await prisma.tenant.update({
    where: { id: slug },
    data: { suspendedAt: suspend ? new Date() : null },
  });
  return Boolean(r);
}
