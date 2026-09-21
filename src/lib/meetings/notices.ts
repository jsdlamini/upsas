/**
 * Meeting notices: the bright banner both people see when a consultation is
 * booked, confirmed, declined or cancelled.
 *
 * Email in this deployment is best-effort and often not configured, so a
 * booking that exists only as a row in a supervisor's list is a booking one
 * side does not know about. A notice is the in-app counterpart: it is created
 * for each party at the moment something changes, stays until that person has
 * seen it, and disappears on its own once it can no longer matter.
 *
 * Three rules keep the banners truthful rather than noisy:
 *
 *   Both parties are told. The person who acted gets a confirmation of what
 *   they did, the other gets told it happened. Neither has to guess.
 *
 *   Bad news is announced as loudly as good news. A system that shouts about
 *   confirmations and whispers about cancellations teaches people to trust a
 *   meeting that is no longer happening.
 *
 *   A newer event retires older ones for the same meeting. "Confirmed" must
 *   never still be on screen after the meeting was cancelled.
 */

export type NoticeKind =
  /** Student asked for a slot; supervisor must confirm or decline. */
  | 'BOOKED'
  /** The student's copy of the same event: sent, awaiting confirmation. */
  | 'REQUESTED'
  /** Supervisor confirmed; both are told. */
  | 'CONFIRMED'
  /** Supervisor declined the booking. */
  | 'DECLINED'
  /** Student cancelled the booking. */
  | 'CANCELLED';

export interface MeetingNotice {
  id: string;
  forUserId: string;
  /** The slot or meeting request the notice is about. */
  meetingRef: string;
  kind: NoticeKind;
  title: string;
  body: string;
  /** When the meeting starts, if it has a time. Drives expiry. */
  startsAt: string | null;
  createdAt: string;
  seenAt: string | null;
  /** Set when a later event about the same meeting replaces this one. */
  supersededAt: string | null;
  /** True when the reader has to do something, not just know something. */
  actionRequired: boolean;
  /**
   * Where the event lives, for this reader: the exact row where it can be
   * confirmed, declined or rebooked. Chosen when the notice is created, because
   * that is when it is known whose screen it will land on. Absent on notices
   * stored before links existed; those fall back to the booking page.
   */
  href?: string;
}

/** Bad news is kept visible for a week even when the meeting time has passed. */
const BAD_NEWS_DAYS = 7;

/** Which banner colour a notice takes. Each is bright; they differ in meaning. */
export function toneOf(kind: NoticeKind): 'confirmed' | 'pending' | 'cancelled' {
  if (kind === 'CONFIRMED') return 'confirmed';
  if (kind === 'DECLINED' || kind === 'CANCELLED') return 'cancelled';
  return 'pending';
}

/**
 * Should this notice be on screen for this person now?
 *
 * Seen and superseded notices never show. A notice about a meeting that has
 * already started stops showing, because "your consultation is confirmed" is
 * noise once it is over; bad news gets a week regardless, because a student
 * who missed the cancellation needs to find out even afterwards.
 */
export function isVisible(notice: MeetingNotice, userId: string, now: Date): boolean {
  if (notice.forUserId !== userId) return false;
  if (notice.seenAt || notice.supersededAt) return false;

  const nowMs = now.getTime();
  if (toneOf(notice.kind) === 'cancelled') {
    return nowMs - Date.parse(notice.createdAt) < BAD_NEWS_DAYS * 86_400_000;
  }
  if (notice.startsAt) return Date.parse(notice.startsAt) > nowMs;
  return true;
}

/** Newest first, with anything needing action ahead of anything informational. */
export function visibleFor(notices: readonly MeetingNotice[], userId: string, now: Date): MeetingNotice[] {
  return notices
    .filter((n) => isVisible(n, userId, now))
    .slice()
    .sort((a, b) =>
      Number(b.actionRequired) - Number(a.actionRequired)
      || b.createdAt.localeCompare(a.createdAt));
}

/**
 * Retire everything outstanding about a meeting before announcing its new
 * state. Returns how many were retired.
 */
export function supersede(notices: MeetingNotice[], meetingRef: string, now: Date): number {
  let retired = 0;
  for (const notice of notices) {
    if (notice.meetingRef !== meetingRef || notice.supersededAt || notice.seenAt) continue;
    notice.supersededAt = now.toISOString();
    retired += 1;
  }
  return retired;
}

/**
 * Already-read notices from the last week, for the "Earlier" part of the bell.
 * A notification list that forgets everything the moment it is opened makes
 * people afraid to open it.
 */
export function recentlySeen(
  notices: readonly MeetingNotice[], userId: string, now: Date, limit = 8,
): MeetingNotice[] {
  const cutoff = now.getTime() - BAD_NEWS_DAYS * 86_400_000;
  return notices
    .filter((n) => n.forUserId === userId && n.seenAt && !n.supersededAt
      && Date.parse(n.createdAt) >= cutoff)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function hrefOf(notice: MeetingNotice): string {
  return notice.href ?? '/book';
}

/** Only the person a notice is addressed to may dismiss it. */
export function dismiss(notices: MeetingNotice[], id: string, userId: string, now: Date): boolean {
  const notice = notices.find((n) => n.id === id);
  if (!notice || notice.forUserId !== userId || notice.seenAt) return false;
  notice.seenAt = now.toISOString();
  return true;
}

export function dismissAll(notices: MeetingNotice[], userId: string, now: Date): number {
  let count = 0;
  for (const notice of notices) {
    if (!isVisible(notice, userId, now)) continue;
    notice.seenAt = now.toISOString();
    count += 1;
  }
  return count;
}

let sequence = 0;

export function makeNotice(
  input: Omit<MeetingNotice, 'id' | 'createdAt' | 'seenAt' | 'supersededAt'>, now: Date,
): MeetingNotice {
  sequence += 1;
  return {
    ...input,
    id: `mn-${now.getTime().toString(36)}-${sequence}`,
    createdAt: now.toISOString(),
    seenAt: null,
    supersededAt: null,
  };
}

/** "Tue 22 Sep, 14:00" in Eswatini time, which is how people say a meeting. */
export function whenLabel(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Mbabane',
  });
}
