'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { sendInviteEmail } from '@/lib/actions/send-invite-email';

type Notice = { kind: 'ok' | 'bad'; text: string } | null;

function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
         style={{ color: '#EA4335' }}>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
         style={{ color: '#25D366' }}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
         style={{ color: '#229ED9' }}>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

/**
 * Shows an institution's join link with share controls: Email (via a server
 * action), WhatsApp/Telegram share intents, and Copy. The full URL is built
 * client-side (seeded with the relative path to avoid a hydration mismatch,
 * then resolved against `window.location.origin` on mount).
 */
export function JoinLink({ slug, institutionName }: { slug: string; institutionName: string }) {
  const path = `/join/${slug}`;
  const [url, setUrl] = useState(path);
  const [copied, setCopied] = useState(false);
  const [whatsappHref, setWhatsappHref] = useState('#');
  const [telegramHref, setTelegramHref] = useState('#');

  const [emailOpen, setEmailOpen] = useState(false);
  const [sendTo, setSendTo] = useState('');
  const [body, setBody] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    const full = `${window.location.origin}${path}`;
    setUrl(full);
    const message = `Join ${institutionName} using this link: ${full}`;
    setWhatsappHref(`https://wa.me/?text=${encodeURIComponent(message)}`);
    setTelegramHref(
      `https://t.me/share/url?url=${encodeURIComponent(full)}&text=${encodeURIComponent(`Join ${institutionName}`)}`,
    );
  }, [path, institutionName]);

  async function copy() {
    const fullUrl = `${window.location.origin}${path}`;
    let ok = false;
    try {
      await navigator.clipboard.writeText(fullUrl);
      ok = true;
    } catch {
      const el = document.getElementById('join-url') as HTMLInputElement | null;
      if (el) {
        el.select();
        try {
          ok = document.execCommand('copy');
        } catch {
          ok = false;
        }
      }
    }
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }

  function openEmail() {
    const fullUrl = `${window.location.origin}${path}`;
    setBody((prev) => prev || `Join ${institutionName} using this link: ${fullUrl}`);
    setNotice(null);
    setEmailOpen((open) => !open);
  }

  async function submitEmail(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEmailBusy(true);
    setNotice(null);
    const result = await sendInviteEmail({
      to: sendTo,
      subject: `Join ${institutionName}`,
      body,
    });
    setEmailBusy(false);
    if (!result.ok) {
      setNotice({ kind: 'bad', text: result.error });
      return;
    }
    setNotice({
      kind: 'ok',
      text:
        result.outcome === 'sent'
          ? 'Invitation sent.'
          : 'Email provider is not configured — nothing was actually sent.',
    });
  }

  return (
    <div>
      <span className="field-label">Invite link</span>
      <Input
        id="join-url"
        readOnly
        value={url}
        title={url}
        onFocus={(e) => e.currentTarget.select()}
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          <CopyIcon />
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openEmail}
          aria-expanded={emailOpen}
        >
          <EmailIcon />
          Email
        </Button>
        <a
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          title="Share on WhatsApp"
        >
          <WhatsAppIcon />
          WhatsApp
        </a>
        <a
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
          href={telegramHref}
          target="_blank"
          rel="noopener noreferrer"
          title="Share on Telegram"
        >
          <TelegramIcon />
          Telegram
        </a>
      </div>

      {emailOpen && (
        <form onSubmit={submitEmail} style={{ marginTop: 12 }}>
          <label className="field">
            <span className="field-label">Send to</span>
            <Input
              type="email"
              required
              value={sendTo}
              onChange={(e) => setSendTo(e.target.value)}
              placeholder="colleague@example.com"
            />
          </label>
          <label className="field">
            <span className="field-label">Message</span>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
            />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="submit" disabled={emailBusy}>
              {emailBusy ? 'Sending…' : 'Send invite'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEmailOpen(false)}>
              Cancel
            </Button>
          </div>
          {notice && (
            <div
              className={`notice${notice.kind === 'bad' ? ' bad' : ''}`}
              style={{ marginTop: 10, marginBottom: 0 }}
            >
              {notice.text}
            </div>
          )}
        </form>
      )}

      <span className="muted" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
        Anyone with this link can join {institutionName} as a student or request staff access.
      </span>
    </div>
  );
}
