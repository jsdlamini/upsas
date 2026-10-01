import type { ReactNode } from 'react';
import './globals.css';
import { ensureHydrated } from '@/lib/data/store';
import { Toasts } from '@/components/toasts';
import { ThemeToggle } from '@/components/theme-toggle';

import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  // One name for the product, used everywhere: repository, README and browser tab.
  title: {
    default: 'UPSAS — UNESWA Research Chain',
    template: '%s · UPSAS',
  },
  applicationName: 'UPSAS',
  description:
    'Research project supervision, topics, consultations and assessment — Department of Computer Science, University of Eswatini',
  // An internal assessment system holding student marks should not be indexed,
  // even if it is briefly reachable from outside the campus network.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Lets the sticky rail sit clear of the notch and home indicator; the
  // stylesheet pads with env(safe-area-inset-*).
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0F1B2D' },
    { media: '(prefers-color-scheme: dark)', color: '#0A111A' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Load the persisted working state (topics, bookings, marks, registrations)
  // before any page reads it, so a restart never loses data.
  await ensureHydrated();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Set the theme before first paint, so there is no flash of the wrong
            scheme. Saved choice wins; otherwise the OS preference. */}
        <script dangerouslySetInnerHTML={{ __html:
          "(function(){try{var t=localStorage.getItem('upsas-theme');if(t!=='dark'&&t!=='light'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='light'}})()",
        }} />
      </head>
      <body>
        <ThemeToggle />
        {children}
        <Toasts />
      </body>
    </html>
  );
}
