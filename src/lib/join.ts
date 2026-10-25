import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { prisma } from './prisma';
import { checkPassword, hashPassword } from './auth/password';
import { CYCLE, STUDENT_NUMBER_PATTERN, PROGRAMMES, COURSES } from './data/store';
import type { InstitutionProfile } from './data/store';

/**
 * Tenant-scoped join registration.
 *
 * Self-serve institutions live entirely in Postgres: `createTenant` provisions
 * their `Tenant` / `Institution` / `User` rows and the login path resolves them
 * through `findUserPrisma` (by email) and `findUserPrismaById` (by id). Join
 * registration writes the same shape so a joined account belongs to the tenant
 * whose slug is in the join URL — no in-memory `default`-tenant state involved.
 */

export type JoinRole = 'SUPERVISOR' | 'ASSESSOR' | 'MODERATOR';

export interface JoinInstitution {
  slug: string;
  name: string;
  productName: string;
  monogram: string;
  accentColor: string;
  logo: InstitutionProfile['logo'];
  suspended: boolean;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

async function joinableTenant(slug: string) {
  if (!process.env.DATABASE_URL) return null;
  const tenant = await prisma.tenant.findUnique({ where: { id: slug } });
  if (!tenant || tenant.suspendedAt) return null;
  return tenant;
}

/** Public join-page data for a slug. Returns null when the tenant is unknown. */
export async function loadJoinInstitution(slug: string): Promise<JoinInstitution | null> {
  if (!process.env.DATABASE_URL) return null;
  const tenant = await prisma.tenant.findUnique({ where: { id: slug } });
  if (!tenant) return null;
  const inst = await prisma.institution.findUnique({ where: { id: slug } });
  return {
    slug: tenant.id,
    name: inst?.name?.trim() || tenant.name,
    productName: inst?.productName?.trim() || 'Research Chain',
    monogram: inst?.monogram ?? '',
    accentColor: inst?.accentColor ?? '#2E5AC8',
    logo: (inst?.logo as InstitutionProfile['logo'] | undefined) ?? null,
    suspended: Boolean(tenant.suspendedAt),
  };
}

export async function joinStudent(input: {
  slug: string; studentNumber: string; surname: string; otherNames: string;
  programme: string; courseCode: string; email: string; password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const tenant = await joinableTenant(input.slug);
  if (!tenant) return { ok: false, error: 'That institution is not accepting new members.' };

  const number = input.studentNumber.trim();
  if (!STUDENT_NUMBER_PATTERN.test(number)) {
    return { ok: false, error: 'Student number must be nine digits, e.g. 202500123.' };
  }
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: 'Enter a valid email address — it is how you sign in.' };
  }
  if (!input.surname.trim() || !input.otherNames.trim()) {
    return { ok: false, error: 'Enter your surname and given names.' };
  }
  const passwordCheck = checkPassword(input.password, [input.surname, input.otherNames, number]);
  if (!passwordCheck.ok) return { ok: false, error: passwordCheck.problems.join(' ') };

  const [byEmail, byUsername, byStudentNumber] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    prisma.user.findUnique({ where: { tenantId_username: { tenantId: input.slug, username: number } } }),
    prisma.studentProfile.findUnique({ where: { studentNumber: number } }),
  ]);
  if (byEmail) return { ok: false, error: 'That email is already registered.' };
  if (byUsername || byStudentNumber) {
    return { ok: false, error: 'A student with that number already has an account.' };
  }

  const hash = await hashPassword(input.password);
  const userId = `u-${input.slug}-${number}`;
  try {
    await prisma.user.create({
      data: {
        id: userId,
        tenantId: input.slug,
        username: number,
        email,
        fullName: `${input.otherNames.trim()} ${input.surname.trim()}`,
        surname: input.surname.trim(),
        status: 'ACTIVE',
        credential: { create: { hash } },
        roles: {
          create: [{ role: 'STUDENT', cycleId: CYCLE, grantedBy: 'join', grantedAt: new Date() }],
        },
        studentProfile: {
          create: {
            id: `s-${input.slug}-${number}`,
            tenantId: input.slug,
            studentNumber: number,
            surname: input.surname.trim(),
            otherNames: input.otherNames.trim(),
            programmeName: input.programme || PROGRAMMES[0],
            courseCode: input.courseCode || COURSES[0],
            projectId: null,
            email,
          },
        },
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: 'That email or student number is already registered.' };
    }
    throw error;
  }
  return { ok: true };
}

export async function joinStaff(input: {
  slug: string; username: string; surname: string; otherNames: string; email: string;
  requestedRoles: JoinRole[]; justification: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const tenant = await joinableTenant(input.slug);
  if (!tenant) return { ok: false, error: 'That institution is not accepting new members.' };

  const username = input.username.trim().toLowerCase();
  if (!USERNAME_RE.test(username)) {
    return { ok: false, error: 'Username must be 3–32 letters, digits, dots, dashes or underscores.' };
  }
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: 'Enter a valid email address — it is how you sign in.' };
  }
  if (!input.surname.trim() || !input.otherNames.trim()) {
    return { ok: false, error: 'Enter your surname and given names.' };
  }
  if (input.requestedRoles.length === 0) return { ok: false, error: 'Pick at least one role.' };
  if (input.justification.trim().length < 10) {
    return { ok: false, error: 'Explain why you need access in at least a sentence.' };
  }

  const [byEmail, byUsername] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    prisma.user.findUnique({ where: { tenantId_username: { tenantId: input.slug, username } } }),
  ]);
  if (byEmail) return { ok: false, error: 'That email is already registered.' };
  if (byUsername) return { ok: false, error: 'That username is taken.' };

  // Staff requests are held pending; they do not choose a password up front.
  // A random credential keeps the account well-formed until an approval flow
  // hands out a real one, and never lets a pending account sign in.
  const hash = await hashPassword(randomBytes(24).toString('base64url'));
  const userId = `u-${input.slug}-${username}`;
  try {
    await prisma.user.create({
      data: {
        id: userId,
        tenantId: input.slug,
        username,
        email,
        fullName: `${input.otherNames.trim()} ${input.surname.trim()}`,
        surname: input.surname.trim(),
        status: 'PENDING_APPROVAL',
        credential: { create: { hash } },
        roles: {
          create: input.requestedRoles.map((role) => ({
            role, cycleId: CYCLE, grantedBy: 'join', grantedAt: new Date(),
          })),
        },
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: 'That email or username is already registered.' };
    }
    throw error;
  }
  return { ok: true };
}
