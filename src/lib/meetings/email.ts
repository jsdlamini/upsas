/**
 * The email version of a meeting notice.
 *
 * Every banner and bell item is also sent by email, from the same event, so the
 * inbox and the screen always tell both people the same thing. The email exists
 * for the case the bell cannot reach: somebody who has not opened the site.
 *
 * Kept deliberately plain. Table layout and inline styles, because that is what
 * mail clients render; a text part alongside, because some people read mail
 * that way and spam filters distrust HTML-only messages; and one button that
 * goes to the exact row where the meeting can be confirmed, declined or rebooked.
 */

import { toneOf, type MeetingNotice } from './notices';

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/** The same three tones as the banners, so an email looks like what it is. */
const TONES = {
  confirmed: { fill: '#1FC16B', ink: '#04291A', word: 'Confirmed' },
  pending: { fill: '#FFB81C', ink: '#2B1B00', word: 'Booking' },
  cancelled: { fill: '#FF6250', ink: '#2B0703', word: 'Changed' },
} as const;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** What the button says depends on what the reader is expected to do. */
function actionLabel(notice: MeetingNotice): string {
  if (notice.kind === 'BOOKED') return 'Confirm or decline';
  if (notice.kind === 'DECLINED' && notice.actionRequired) return 'Book another time';
  return 'Open in UPSAS';
}

/**
 * `openUrl` is absolute and goes through the open route, which marks the notice
 * read and — if the reader is signed out — signs them in first and then lands
 * them on the event.
 */
export function renderNoticeEmail(
  notice: MeetingNotice, recipientName: string, openUrl: string,
): RenderedEmail {
  const tone = TONES[toneOf(notice.kind)];
  // "Hello Sipho" for a student; "Hello Dr Mahlalela" rather than "Hello Dr" for staff.
  const words = recipientName.trim().split(/\s+/);
  const titled = /^(dr|prof|professor|mr|mrs|ms)\.?$/i.test(words[0] ?? '');
  const firstName = titled && words.length > 1 ? `${words[0]} ${words[words.length - 1]}` : (words[0] || recipientName);
  const needsYou = notice.actionRequired ? ' — action needed' : '';
  const subject = `${notice.title}${needsYou}`;
  const button = actionLabel(notice);

  const text = [
    `Hello ${firstName},`,
    '',
    notice.title,
    notice.body,
    '',
    `${button}: ${openUrl}`,
    '',
    '—',
    'UPSAS · Research project supervision, Department of Computer Science, University of Eswatini.',
    'You receive this because a consultation you are part of changed. The same notice is in the bell in UPSAS.',
  ].join('\n');

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F6F9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F9;padding:24px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="max-width:560px;background:#FFFFFF;border:1px solid #D7DEE7;border-radius:14px;overflow:hidden;
                font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0F1B2D;">
    <tr><td style="background:${tone.fill};padding:18px 24px;">
      <span style="display:inline-block;background:${tone.ink};color:${tone.fill};font-size:11px;font-weight:700;
                   letter-spacing:.08em;text-transform:uppercase;padding:5px 10px;border-radius:999px;">
        ${escapeHtml(tone.word)}${notice.actionRequired ? ' · needs you' : ''}
      </span>
      <div style="margin-top:10px;font-size:19px;line-height:1.3;font-weight:700;color:${tone.ink};">
        ${escapeHtml(notice.title)}
      </div>
    </td></tr>
    <tr><td style="padding:22px 24px 8px;font-size:15px;line-height:1.55;">
      <p style="margin:0 0 12px;">Hello ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 20px;color:#2C3A4C;">${escapeHtml(notice.body)}</p>
      <a href="${escapeHtml(openUrl)}"
         style="display:inline-block;background:#2E5AC8;color:#FFFFFF;text-decoration:none;font-weight:600;
                font-size:15px;padding:12px 20px;border-radius:8px;">${escapeHtml(button)}</a>
      <p style="margin:18px 0 0;font-size:12.5px;color:#5A6679;">
        Or paste this into your browser:<br>
        <span style="word-break:break-all;">${escapeHtml(openUrl)}</span>
      </p>
    </td></tr>
    <tr><td style="padding:18px 24px 22px;font-size:12px;line-height:1.5;color:#5A6679;border-top:1px solid #E6EBF1;">
      UPSAS · Research project supervision, Department of Computer Science, University of Eswatini.<br>
      You receive this because a consultation you are part of changed. The same notice is in the bell in UPSAS.
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;

  return { subject, text, html };
}
