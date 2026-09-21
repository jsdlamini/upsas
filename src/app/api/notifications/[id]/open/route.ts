import { NextResponse, type NextRequest } from 'next/server';
import { currentPrincipal } from '@/lib/auth/current';
import { openNotice } from '@/lib/data/store';

export const dynamic = 'force-dynamic';

/**
 * Clicking a notification: mark it read and go to where the event lives.
 *
 * A plain link rather than a script, so it works from the bell with scripts
 * off, from a desktop alert, and from a pop-up alike. Somebody else's notice
 * id is treated as unknown and lands on the booking page, which says nothing
 * about whether it exists.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await currentPrincipal();
  if (!principal) {
    // Arriving from an email while signed out: sign in, then come straight back.
    const back = `/api/notifications/${encodeURIComponent(id)}/open`;
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(back)}`, request.url), 303);
  }

  const href = openNotice(decodeURIComponent(id), principal.userId) ?? '/book';
  // Only ever an internal path: a stored href is never allowed to send
  // someone off-site.
  const target = href.startsWith('/') && !href.startsWith('//') ? href : '/book';
  return NextResponse.redirect(new URL(target, request.url), 303);
}
