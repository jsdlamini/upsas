'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import type { ToastVariant } from '@/lib/toast';

type Toast = { id: number; message: string; variant: ToastVariant };

function pushToast(setToasts: React.Dispatch<React.SetStateAction<Toast[]>>, t: Toast) {
  setToasts((cur) => [...cur, t]);
  setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== t.id)), 4200);
}

/** Client-side toasts dispatched via showToast() (lib/toast.ts). */
function ToastViewport() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { message: string; variant?: ToastVariant };
      pushToast(setToasts, { id: Date.now(), message: detail.message, variant: detail.variant ?? 'info' });
    };
    window.addEventListener('upsas-toast', handler);
    return () => window.removeEventListener('upsas-toast', handler);
  }, []);

  if (!toasts.length) return null;
  return (
    <div className="ui-toast-wrap">
      {toasts.map((t) => (
        <div key={t.id} className={`ui-toast ui-toast-${t.variant}`} role="status" aria-live="polite">
          <span>{t.message}</span>
          <button
            type="button"
            onClick={() => setToasts((cur) => cur.filter((x) => x.id !== t.id))}
            aria-label="Dismiss"
            style={{ marginLeft: 'auto', background: 'none', border: 0, color: 'inherit', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

/** Reads a ?toast= message from the URL and shows it as a transient toast. */
function ToastsInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const msg = searchParams.get('toast');
    if (!msg) return;
    setToast(msg);
    const timer = setTimeout(() => setToast(null), 4000);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('toast');
    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false });
    return () => clearTimeout(timer);
  }, [searchParams, router, pathname]);

  if (!toast) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      <span>{toast}</span>
      <button className="toast-close" onClick={() => setToast(null)} aria-label="Dismiss">×</button>
    </div>
  );
}

export function Toasts() {
  return (
    <Suspense fallback={null}>
      <ToastViewport />
      <ToastsInner />
    </Suspense>
  );
}
