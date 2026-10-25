'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Shows an institution's join link with a copy button. The full URL is built
 * client-side (seeded with the relative path to avoid a hydration mismatch,
 * then resolved against `window.location.origin` on mount).
 */
export function JoinLink({ slug, institutionName }: { slug: string; institutionName: string }) {
  const path = `/join/${slug}`;
  const [url, setUrl] = useState(path);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setUrl(`${window.location.origin}${path}`);
  }, [path]);

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

  return (
    <div>
      <span className="field-label">Invite link</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <Input
          id="join-url"
          readOnly
          value={url}
          title={url}
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
