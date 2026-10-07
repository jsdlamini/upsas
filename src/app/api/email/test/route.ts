import { NextResponse } from 'next/server';
import { currentPrincipal } from '@/lib/auth/current';
import { can } from '@/lib/rbac/policy';
import { testEmail } from '@/lib/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const principal = await currentPrincipal();
  if (!principal) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  if (!can(principal, 'config.edit').allow) {
    return NextResponse.json({ error: 'Not permitted.' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { to?: string } | null;
  const to = body?.to?.trim();
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  const outcome = await testEmail(to);
  return NextResponse.json({ outcome });
}
