import {
  getStoredEmailSettings, setStoredEmailSettings, type EmailSettings,
} from './data/store';

export type { EmailSettings, EmailProvider } from './data/store';

export const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  provider: 'none',
  fromName: '',
  fromEmail: '',
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: true,
  smtpUser: '',
  smtpPass: '',
};

export function getEmailSettings(): EmailSettings {
  const stored = getStoredEmailSettings();
  if (stored) return stored;
  // Backward-compatible default: an install that already sets RESEND_API_KEY
  // keeps sending via Resend until the wizard records an explicit choice.
  return { ...DEFAULT_EMAIL_SETTINGS, provider: process.env.RESEND_API_KEY ? 'resend' : 'none' };
}

export function saveEmailSettings(
  patch: Partial<EmailSettings>,
): { ok: true } | { ok: false; error: string } {
  const current = getStoredEmailSettings() ?? DEFAULT_EMAIL_SETTINGS;
  const next: EmailSettings = { ...current, ...patch };

  if (next.provider === 'smtp' && !next.smtpHost.trim()) {
    return { ok: false, error: 'SMTP host is required.' };
  }
  if (next.smtpPort < 1 || next.smtpPort > 65535) {
    return { ok: false, error: 'SMTP port must be between 1 and 65535.' };
  }

  setStoredEmailSettings(next);
  return { ok: true };
}
