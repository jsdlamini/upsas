'use client';

import { useEffect, useState } from 'react';

/** Manual light/dark switch. The initial value is set by the inline script in
 *  the root layout (before paint) so this only flips and remembers it. */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.dataset.theme === 'dark');
  }, []);

  const toggle = () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('upsas-theme', next);
    } catch {
      /* private mode: the choice just won't persist */
    }
    setDark(next === 'dark');
  };

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
           strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {dark ? (
          <circle cx="12" cy="12" r="4" />
        ) : (
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />
        )}
      </svg>
      <span>{dark ? 'Light' : 'Dark'}</span>
    </button>
  );
}
