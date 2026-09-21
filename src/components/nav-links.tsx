'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { isCurrent, sectionOf } from '@/lib/nav/section';

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  count?: number;
}

/**
 * The rail's links, highlighted from the browser's own idea of the current page.
 *
 * The highlight used to be computed in the server layout. App Router keeps a
 * layout mounted across client-side navigations, so after the first click the
 * layout never re-rendered and the highlight stayed on whichever page was
 * loaded first. Reading the path here, where it updates on every navigation,
 * is what makes the lit item follow the click.
 */
export function NavLinks({ items }: { items: NavItem[] }) {
  const path = usePathname() || '/';

  // The section hue and the mobile menu live outside this component; bring
  // both into line with the page just navigated to.
  useEffect(() => {
    const shell = document.querySelector<HTMLElement>('.shell');
    if (shell) shell.dataset['section'] = sectionOf(path);
    const toggle = document.getElementById('nav-toggle') as HTMLInputElement | null;
    if (toggle) toggle.checked = false;
  }, [path]);

  return (
    <>
      {items.map((item) => {
        const on = isCurrent(item.href, path);
        return (
          <Link key={item.href} href={item.href} className={on ? 'on' : undefined}
                aria-current={on ? 'page' : undefined}>
            {item.icon}{item.label}
            {item.count ? (
              <span className="nav-count" aria-label={`${item.count} new`}>{item.count}</span>
            ) : null}
          </Link>
        );
      })}
    </>
  );
}
