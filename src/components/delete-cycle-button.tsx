'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

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

  return (
    <form action={action} style={{ marginTop: 8 }}>
      <input type="hidden" name="id" value={id} />
      {confirming ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
            Delete <strong className="mono">{label}</strong>? This cannot be undone. Cycles that are
            still referenced by role grants, deadlines, presentation sessions or marks — or that
            are the current cycle — cannot be deleted.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="submit" variant="destructive" size="sm">Yes, delete</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="ghost" onClick={() => setConfirming(true)}>Delete</Button>
      )}
    </form>
  );
}
