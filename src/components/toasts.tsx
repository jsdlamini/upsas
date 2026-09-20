'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';

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
    // Clear the param without a full reload.
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
      <ToastsInner />
    </Suspense>
  );
}
