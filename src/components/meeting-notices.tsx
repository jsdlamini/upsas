import { revalidatePath } from 'next/cache';
import { currentPrincipal } from '@/lib/auth/current';
import { noticesFor, dismissNotice, dismissAllNotices } from '@/lib/data/store';
import { toneOf } from '@/lib/meetings/notices';

async function dismissOne(formData: FormData) {
  'use server';
  const principal = await currentPrincipal();
  if (!principal) return;
  // The store refuses a notice addressed to anybody else.
  dismissNotice(String(formData.get('id')), principal.userId);
  revalidatePath('/', 'layout');
}

async function dismissEverything() {
  'use server';
  const principal = await currentPrincipal();
  if (!principal) return;
  dismissAllNotices(principal.userId);
  revalidatePath('/', 'layout');
}

const TONE_LABEL = {
  confirmed: 'Confirmed',
  pending: 'Booking',
  cancelled: 'Changed',
} as const;

/**
 * The banners at the top of every page.
 *
 * They sit in the shell rather than on the booking screen because the point is
 * to reach someone who was not looking for it: a supervisor marking a sheet
 * should still see that a student has just booked tomorrow at nine.
 */
export async function MeetingNotices({ userId }: { userId: string }) {
  const notices = noticesFor(userId);
  if (notices.length === 0) return null;

  return (
    <section className="meeting-notices" aria-label="Meeting notifications" aria-live="polite">
      {notices.map((notice) => {
        const tone = toneOf(notice.kind);
        return (
          <div key={notice.id} className={`meeting-notice ${tone}`} role="status">
            <span className="mn-badge" aria-hidden="true">
              <span className="mn-dot" />{TONE_LABEL[tone]}
            </span>
            <div className="mn-text">
              <strong>{notice.title}</strong>
              <span>{notice.body}</span>
            </div>
            <div className="mn-actions">
              {notice.actionRequired && notice.kind === 'BOOKED' && (
                <a className="mn-go" href="/book">Review</a>
              )}
              {notice.actionRequired && notice.kind === 'DECLINED' && (
                <a className="mn-go" href="/book">Book another</a>
              )}
              <form action={dismissOne}>
                <input type="hidden" name="id" value={notice.id} />
                <button className="mn-dismiss" type="submit" aria-label={`Dismiss: ${notice.title}`}>
                  Got it
                </button>
              </form>
            </div>
          </div>
        );
      })}
      {notices.length > 2 && (
        <form action={dismissEverything} className="mn-all">
          <button className="link" type="submit">Dismiss all {notices.length}</button>
        </form>
      )}
    </section>
  );
}
