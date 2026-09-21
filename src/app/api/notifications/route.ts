import { NextResponse } from 'next/server';
import { currentPrincipal } from '@/lib/auth/current';
import { noticesFor } from '@/lib/data/store';
import { toneOf } from '@/lib/meetings/notices';

export const dynamic = 'force-dynamic';

/**
 * The live feed behind the bell.
 *
 * Polled by the page every half minute and whenever the tab regains focus.
 * Deliberately small: ids, titles and where to go. The full list is rendered
 * by the server, so the client only needs to know whether anything changed
 * and what to put in a pop-up.
 */
export async function GET() {
  const principal = await currentPrincipal();
  if (!principal) return NextResponse.json({ count: 0, items: [] }, { status: 401 });

  const items = noticesFor(principal.userId).map((n) => ({
    id: n.id,
    tone: toneOf(n.kind),
    title: n.title,
    body: n.body,
    actionRequired: n.actionRequired,
    createdAt: n.createdAt,
    openUrl: `/api/notifications/${encodeURIComponent(n.id)}/open`,
  }));

  return NextResponse.json(
    { count: items.length, items },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
