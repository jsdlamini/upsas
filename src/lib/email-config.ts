import {
  getStoredEmailSettings, setStoredEmailSettings, type EmailSettings,
} from './data/store';
import { requestTenantId } from './tenant';

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

export async function getEmailSettings(): Promise<EmailSettings> {
  const stored = await getStoredEmailSettings(await requestTenantId());
  if (!stored) {
    // Backward-compatible default: an install that already sets RESEND_API_KEY
    // keeps sending via Resend until the wizard records an explicit choice.
    return { ...DEFAULT_EMAIL_SETTINGS, provider: process.env.RESEND_API_KEY ? 'resend' : 'none' };
  }
  // A stored 'none' row (createTenant's default for self-served institutions)
  // should still pick up the deployment-level Resend key when one is set, so
  // invites actually send instead of being stubbed. Air-gapped installs (no
  // key) and explicit SMTP choices are left untouched.
  if (stored.provider === 'none' && process.env.RESEND_API_KEY) {
    return { ...stored, provider: 'resend' };
  }
  return stored;
}

export async function saveEmailSettings(
  patch: Partial<EmailSettings>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const tenantId = await requestTenantId();
  const current = (await getStoredEmailSettings(tenantId)) ?? DEFAULT_EMAIL_SETTINGS;
  const next: EmailSettings = { ...current, ...patch };

  if (next.provider === 'smtp' && !next.smtpHost.trim()) {
    return { ok: false, error: 'SMTP host is required.' };
  }
  if (next.smtpPort < 1 || next.smtpPort > 65535) {
    return { ok: false, error: 'SMTP port must be between 1 and 65535.' };
  }

  await setStoredEmailSettings(tenantId, next);
  return { ok: true };
}
