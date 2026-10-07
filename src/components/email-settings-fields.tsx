'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import type { EmailSettings, EmailProvider } from '@/lib/email-config';

/**
 * Email provider + conditional fields, rendered client-side so the SMTP fields
 * hide as soon as Resend (or None) is chosen instead of waiting for a save.
 */
export function EmailSettingsFields({
  email,
  defaultFromName,
}: {
  email: EmailSettings;
  defaultFromName: string;
}) {
  const [provider, setProvider] = useState<EmailProvider>(email.provider);
  const showSmtp = provider === 'smtp';

  return (
    <>
      <div className="field">
        <span className="field-label">Provider</span>
        <select
          name="emailProvider"
          defaultValue={email.provider}
          onChange={(e) => setProvider(e.target.value as EmailProvider)}
        >
          <option value="none">None (no email)</option>
          <option value="resend">Resend</option>
          <option value="smtp">SMTP</option>
        </select>
      </div>

      <label className="field">
        <span className="field-label">From name</span>
        <Input name="fromName" defaultValue={email.fromName || defaultFromName} />
      </label>
      <label className="field">
        <span className="field-label">From email</span>
        <Input name="fromEmail" type="email" defaultValue={email.fromEmail} placeholder="no-reply@your-institution.edu" />
      </label>

      {showSmtp && (
        <>
          <label className="field">
            <span className="field-label">SMTP host</span>
            <Input name="smtpHost" defaultValue={email.smtpHost} placeholder="smtp.example.com" />
          </label>
          <label className="field">
            <span className="field-label">SMTP port</span>
            <Input name="smtpPort" type="number" defaultValue={email.smtpPort} />
          </label>
          <label className="field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" name="smtpSecure" defaultChecked={email.smtpSecure} />
            <span style={{ fontSize: 13 }}>Use TLS (secure)</span>
          </label>
          <label className="field">
            <span className="field-label">SMTP user</span>
            <Input name="smtpUser" defaultValue={email.smtpUser} autoComplete="off" />
          </label>
          <label className="field">
            <span className="field-label">SMTP password</span>
            <Input name="smtpPass" type="password" defaultValue={email.smtpPass} autoComplete="off" />
          </label>
        </>
      )}
    </>
  );
}
