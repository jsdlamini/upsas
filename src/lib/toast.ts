export type ToastVariant = 'success' | 'error' | 'info';

/** Show a client-side toast (dispatches to the ToastViewport component). */
export function showToast(message: string, variant: ToastVariant = 'info'): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('upsas-toast', { detail: { message, variant } }),
  );
}
