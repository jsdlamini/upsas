'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { showToast } from '@/lib/toast';
import type { Flash } from '@/lib/flash';

/**
 * Shows server-rendered flash messages as client-side toasts, then strips their
 * params from the URL so a refresh does not replay them.
 *
 * The dispatch is deferred one tick because the app-wide ToastViewport registers
 * its `upsas-toast` listener in its own mount effect, which runs after this
 * component's effect (it sits later in the tree). Dispatching synchronously
 * would fire the event before any listener exists.
 */
export function FlashToast({ flashes, keys }: { flashes: Flash[]; keys: string[] }) {
  const router = useRouter();

  useEffect(() => {
    if (flashes.length === 0 && keys.length === 0) return;

    const timer = setTimeout(() => {
      for (const flash of flashes) showToast(flash.message, flash.variant);

      if (keys.length === 0) return;
      const url = new URL(window.location.href);
      let changed = false;
      for (const key of keys) {
        if (url.searchParams.has(key)) {
          url.searchParams.delete(key);
          changed = true;
        }
      }
      if (changed) {
        router.replace(url.pathname + url.search + url.hash, { scroll: false });
      }
    }, 0);

    return () => clearTimeout(timer);
    // Run once on mount: the server supplies flashes only for the URL the page
    // was loaded with, and those params are stripped immediately after.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
