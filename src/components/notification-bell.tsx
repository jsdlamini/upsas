import { revalidatePath } from 'next/cache';
import { currentPrincipal } from '@/lib/auth/current';
import { noticesFor, recentNoticesFor, dismissAllNotices } from '@/lib/data/store';
import { toneOf, hrefOf, type MeetingNotice } from '@/lib/meetings/notices';
import { BellLive, AlertsToggle } from '@/components/bell-live';

async function markAllRead() {
  'use server';
  const principal = await currentPrincipal();
  if (!principal) return;
  dismissAllNotices(principal.userId);
  revalidatePath('/', 'layout');
}

function ago(iso: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

const TONE_WORD = { confirmed: 'Confirmed', pending: 'Booking', cancelled: 'Changed' } as const;

function Item({ notice, unread, now }: { notice: MeetingNotice; unread: boolean; now: number }) {
  const tone = toneOf(notice.kind);
  // Unread items go through the open route so opening marks them read; read
  // ones link straight to the event.
  const href = unread ? `/api/notifications/${encodeURIComponent(notice.id)}/open` : hrefOf(notice);
  return (
    <li className={`bell-item ${tone}${unread ? ' unread' : ''}`}>
      <a href={href}>
        <span className="bell-tone" aria-hidden="true" />
        <span className="bell-copy">
          <span className="bell-kind">
            {TONE_WORD[tone]}
            {unread && notice.actionRequired && <em>needs you</em>}
          </span>
          <strong>{notice.title}</strong>
          <span className="bell-body">{notice.body}</span>
          <time dateTime={notice.createdAt}>{ago(notice.createdAt, now)}</time>
        </span>
        <span className="bell-go" aria-hidden="true">›</span>
      </a>
    </li>
  );
}

/**
 * The bell in the corner of every page.
 *
 * A <details> element, so it opens and closes with scripts off and every item
 * is an ordinary link. The live part — polling, pop-up balloons, desktop
 * alerts, the count in the tab title — is layered on by BellLive and is never
 * required for the list to work.
 */
export async function NotificationBell({ userId }: { userId: string }) {
  const now = Date.now();
  const unread = noticesFor(userId);
  const earlier = recentNoticesFor(userId);
  const count = unread.length;

  return (
    <div className="bell-wrap">
      <details className="bell" id="bell">
        <summary aria-label={count ? `Notifications, ${count} new` : 'Notifications, none new'}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {count > 0 && <span className="bell-count">{count > 9 ? '9+' : count}</span>}
        </summary>

        <div className="bell-panel" role="region" aria-label="Notifications">
          <div className="bell-head">
            <strong>Notifications</strong>
            {count > 0 && (
              <form action={markAllRead}>
                <button className="link" type="submit">Mark all read</button>
              </form>
            )}
          </div>

          {count === 0 && (
            <p className="bell-empty">
              Nothing new. Bookings, confirmations and changes to your meetings appear here.
            </p>
          )}
          {count > 0 && (
            <ul className="bell-list">
              {unread.map((n) => <Item key={n.id} notice={n} unread now={now} />)}
            </ul>
          )}

          {earlier.length > 0 && (
            <>
              <p className="bell-section">Earlier</p>
              <ul className="bell-list">
                {earlier.map((n) => <Item key={n.id} notice={n} unread={false} now={now} />)}
              </ul>
            </>
          )}

          <div className="bell-foot">
            <AlertsToggle />
            <a href="/book">All bookings</a>
          </div>
        </div>
      </details>

      <BellLive initialIds={unread.map((n) => n.id)} />
    </div>
  );
}
