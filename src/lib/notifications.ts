import { prisma } from "./prisma";
import { getInstitution } from "./institution";
import { getEmailSettings, type EmailSettings } from "./email-config";

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
 * Send through the configured provider (Resend, SMTP, or none). Never throws.
 */
export async function sendEmail(email: OutgoingEmail): Promise<SendOutcome> {
  if (!email.to) {
    console.log("[email:stub]", "(no recipient)", "|", email.subject);
    return "stubbed";
  }

  const settings = await getEmailSettings();
  const product = (await getInstitution()).productName || 'Research Chain';
  const fromName = settings.fromName || product;
  const fromEmail = settings.fromEmail || 'no-reply@localhost';
  const from = `${fromName} <${fromEmail}>`;

  // Testing switch: route every message to one inbox, labelled with its real
  // recipient, so a shared sender can be exercised without real addresses.
  const redirect = process.env.EMAIL_REDIRECT_TO?.trim();
  const to = redirect || email.to;
  const subject = redirect ? `[for ${email.to}] ${email.subject}` : email.subject;

  if (settings.provider === 'none') {
    console.log("[email:stub]", to, "|", subject);
    return "stubbed";
  }
  if (settings.provider === 'resend') return sendViaResend({ ...email, to, subject }, from);
  return sendViaSmtp({ ...email, to, subject }, from, settings);
}

async function sendViaResend(email: OutgoingEmail, from: string): Promise<SendOutcome> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log("[email:stub]", email.to, "|", email.subject, "(no RESEND_API_KEY)");
    return "stubbed";
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
        ...(email.html ? { html: email.html } : {}),
        ...(email.replyTo ? { reply_to: email.replyTo } : {}),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.log("[email:failed]", email.to, "|", email.subject, "|", res.status, detail.slice(0, 300));
      return "failed";
    }
    return "sent";
  } catch (error) {
    console.log("[email:failed]", email.to, "|", email.subject, "|", error instanceof Error ? error.message : String(error));
    return "failed";
  }
}

async function sendViaSmtp(email: OutgoingEmail, from: string, settings: EmailSettings): Promise<SendOutcome> {
  try {
    const nodemailer = await import('nodemailer');
    const transport = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpSecure,
      auth: settings.smtpUser ? { user: settings.smtpUser, pass: settings.smtpPass } : undefined,
    });
    await transport.sendMail({
      from,
      to: email.to,
      subject: email.subject,
      text: email.body,
      ...(email.html ? { html: email.html } : {}),
      ...(email.replyTo ? { replyTo: email.replyTo } : {}),
    });
    return "sent";
  } catch (error) {
    console.log("[email:failed]", email.to, "|", email.subject, "|", error instanceof Error ? error.message : String(error));
    return "failed";
  }
}

/** One-off message through the configured provider, to verify it works. */
export async function testEmail(to: string): Promise<SendOutcome> {
  return sendEmail({
    to,
    subject: 'Test email',
    body: 'This is a test email from your research system. If you received this, your email provider is configured correctly.',
  });
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
