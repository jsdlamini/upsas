'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Shows an institution's join link with a copy button. The link is rendered as
 * a relative path (so it never depends on the host header at render time) and
 * the copy button resolves it against `window.location.origin` at click time.
 */
export function JoinLink({ slug, institutionName }: { slug: string; institutionName: string }) {
  const path = `/join/${slug}`;
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${window.location.origin}${path}`;
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
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

  return (
    <div>
      <span className="field-label">Invite link</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <Input
          id="join-url"
          readOnly
          value={path}
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button type="button" variant="outline" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <span className="muted" style={{ display: 'block', marginTop: 6, fontSize: 12 }}>
        Anyone with this link can join {institutionName} as a student or request staff access.
      </span>
    </div>
  );
}
