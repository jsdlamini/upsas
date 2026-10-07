'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Outcome = 'sent' | 'stubbed' | 'failed';

/**
 * Sends a test email without reloading the page, so the surrounding settings
 * form keeps whatever has been typed but not yet saved.
 */
export function TestEmail({ defaultTo }: { defaultTo: string }) {
  const [to, setTo] = useState(defaultTo);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ outcome: Outcome; message: string } | null>(null);

  async function send() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to }),
      });
      const data = (await res.json().catch(() => ({}))) as { outcome?: Outcome; error?: string };
      if (!res.ok || !data.outcome) {
        setResult({ outcome: 'failed', message: data.error || 'Test email failed.' });
        return;
      }
      setResult({
        outcome: data.outcome,
        message: data.outcome === 'sent'
          ? 'Test email sent — check the inbox.'
          : data.outcome === 'stubbed'
            ? 'Email provider is not configured — nothing was sent.'
            : 'Test email failed.',
      });
    } catch {
      setResult({ outcome: 'failed', message: 'Test email failed.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 18, borderTop: '1px solid var(--rule)', paddingTop: 16 }}>
      <span className="field-label">Send a test email to</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <Input
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="you@example.com"
        />
        <Button variant="outline" type="button" onClick={send} disabled={busy}>
          {busy ? 'Sending…' : 'Send test'}
        </Button>
      </div>
      {result && (
        <div className={`notice${result.outcome === 'failed' ? ' bad' : ''}`} style={{ marginTop: 8 }}>
          {result.message}
        </div>
      )}
    </div>
  );
}
