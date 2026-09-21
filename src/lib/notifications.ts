import { prisma } from "./prisma";

/**
 * Provider-agnostic notifications: in-app rows (Postgres) plus email via a
 * configurable SMTP adapter. The SMTP transport is stubbed to console in this
 * build — wire a real transport here without touching any caller.
 */

export type NotificationKind =
  | "booking_confirmed"
  | "booking_reminder"
  | "grade_released"
  | "deliverable_due"
  | "schedule_published"
  | "nomination_outcome"
  | "ethics_status"
  | "low_consultation"
  | "moderation_required";

export interface OutgoingEmail {
  to: string;
  subject: string;
  body: string;
  /** Optional HTML part. The plain-text body is always sent alongside it. */
  html?: string;
  /** Where a reply should go, e.g. the other person in the meeting. */
  replyTo?: string;
}

export type SendOutcome = 'sent' | 'stubbed' | 'failed';

/**
 * Send via Resend (https://resend.com). Falls back to a console log when no
 * API key is configured, so the demo runs without outbound mail.
 */
export async function sendEmail(email: OutgoingEmail): Promise<SendOutcome> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || process.env.RESEND_FROM || "UNESWA Research Chain <onboarding@resend.dev>";
  if (!key || !email.to) {
    console.log("[email:stub]", email.to || "(no recipient)", "|", email.subject);
    return "stubbed";
  }

  // Testing switch. Resend's shared onboarding@resend.dev sender will only
  // deliver to the address that owns the Resend account, so until a domain is
  // verified every message is redirected there, labelled with who it was for.
  const redirect = process.env.EMAIL_REDIRECT_TO?.trim();
  const to = redirect || email.to;
  const subject = redirect ? `[for ${email.to}] ${email.subject}` : email.subject;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text: email.body,
        ...(email.html ? { html: email.html } : {}),
        ...(email.replyTo ? { reply_to: email.replyTo } : {}),
      }),
    });
    if (!res.ok) {
      // Resend explains itself in the body; the usual one is the shared test
      // sender refusing a recipient other than the account owner.
      const detail = await res.text().catch(() => "");
      console.log("[email:failed]", to, "|", subject, "|", res.status, detail.slice(0, 300));
      return "failed";
    }
    return "sent";
  } catch (error) {
    console.log("[email:failed]", to, "|", subject, "|", error instanceof Error ? error.message : String(error));
    return "failed";
  }
}

export async function notifyUser(
  userId: string,
  kind: NotificationKind,
  subject: string,
  body: string,
  email?: OutgoingEmail,
): Promise<void> {
  const jobs: Promise<unknown>[] = [
    prisma.notification
      .create({ data: { userId, kind, subject, body } })
      .catch(() => undefined),
  ];
  if (email) jobs.push(sendEmail(email));
  await Promise.all(jobs);
}

export async function notificationsFor(userId: string) {
  try {
    return await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  } catch {
    return [];
  }
}
