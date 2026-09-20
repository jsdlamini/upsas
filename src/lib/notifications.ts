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
}

/**
 * Send via Resend (https://resend.com). Falls back to a console log when no
 * API key is configured, so the demo runs without outbound mail.
 */
export async function sendEmail(email: OutgoingEmail): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || process.env.RESEND_FROM || "UNESWA Research Chain <onboarding@resend.dev>";
  if (!key || !email.to) {
    console.log("[email:stub]", email.to || "(no recipient)", "|", email.subject);
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email.to],
        subject: email.subject,
        text: email.body,
      }),
    });
    if (!res.ok) {
      console.log("[email:failed]", email.to, "|", email.subject, "|", res.status);
    }
  } catch (error) {
    console.log("[email:failed]", email.to, "|", email.subject, "|", error instanceof Error ? error.message : String(error));
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
