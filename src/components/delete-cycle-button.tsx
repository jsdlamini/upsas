'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Two-step delete for an academic cycle.
 *
 * The resting control is a destructive-outline button — visibly a button,
 * visibly dangerous — because a plain ghost label reads as page furniture
 * and people click it without noticing. Confirming swaps to a filled
 * destructive button beside an explicit warning, so the irreversible step
 * is unmistakable.
 */
export function DeleteCycleButton({
  id,
  label,
  action,
}: {
  id: string;
  label: string;
  action: (formData: FormData) => void;
}) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <form action={action} style={{ marginTop: 10 }}>
        <input type="hidden" name="id" value={id} />
        <div
          role="alert"
          style={{
            display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start',
            border: '1px solid var(--rust-line)', background: 'var(--rust-dim)',
            borderRadius: 'var(--radius-sm)', padding: '10px 12px',
          }}
        >
          <p style={{ fontSize: 12.5, margin: 0, color: 'var(--rust)' }}>
            Delete <strong className="mono">{label}</strong>? This cannot be undone. Cycles that are
            still referenced by role grants, deadlines, presentation sessions or marks — or that
            are the current cycle — cannot be deleted.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="submit" variant="destructive" size="sm">Yes, delete permanently</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <form action={action} style={{ marginTop: 10 }}>
      <input type="hidden" name="id" value={id} />
      <Button type="button" variant="destructive-outline" size="sm" onClick={() => setConfirming(true)}>
        Delete…
      </Button>
    </form>
  );
}
