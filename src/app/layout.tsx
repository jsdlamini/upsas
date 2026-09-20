import type { ReactNode } from 'react';
import './globals.css';
import { ensureHydrated } from '@/lib/data/store';
import { Toasts } from '@/components/toasts';

export const metadata = {
  title: 'UNESWA Research Chain',
  description: 'Research project supervision, topics, consultations and assessment — University of Eswatini',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Load the persisted working state (topics, bookings, marks, registrations)
  // before any page reads it, so a restart never loses data.
  await ensureHydrated();

  return (
    <html lang="en">
      <body>
        {children}
        <Toasts />
      </body>
    </html>
  );
}
