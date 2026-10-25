'use server';

import { currentPrincipal } from '@/lib/auth/current';
import { can } from '@/lib/rbac/policy';
import { sendEmail } from '@/lib/notifications';

export type InviteEmailResult =
  | { ok: true; outcome: 'sent' | 'stubbed' }
  | { ok: false; error: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Server action for the institution invite-link email share. Sends the
 * provided message through the configured provider (`sendEmail`), gated to
 * the same `config.edit` permission that shows the settings page.
 */
export async function sendInviteEmail(input: {
  to: string;
  subject: string;
  body: string;
}): Promise<InviteEmailResult> {
  const principal = await currentPrincipal();
  if (!principal) return { ok: false, error: 'Sign in required.' };
  if (!can(principal, 'config.edit').allow) {
    return { ok: false, error: 'You are not permitted to send invitations.' };
  }

  const to = input.to.trim();
  if (!EMAIL_RE.test(to)) return { ok: false, error: 'Enter a valid email address.' };

  const body = input.body.trim();
  if (!body) return { ok: false, error: 'The message body cannot be empty.' };

  const subject = input.subject.trim() || 'Invitation';

  const outcome = await sendEmail({ to, subject, body });
  if (outcome === 'failed') {
    return {
      ok: false,
      error: 'The invitation could not be sent. Check the email provider configuration.',
    };
  }
  return { ok: true, outcome };
}
