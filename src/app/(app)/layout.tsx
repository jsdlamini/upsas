import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { currentPrincipal, destroySession, COOKIE } from '@/lib/auth/current';
import { findPerson } from '@/lib/data/store';

export const dynamic = 'force-dynamic';

const ICONS: Record<string, ReactNode> = {
  '/me': <svg width="15" height="15" viewBox="0 0 24 24" {...{ fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  '/': <svg width="15" height="15" viewBox="0 0 24 24" {...{ fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  '/topics': <svg width="15" height="15" viewBox="0 0 24 24" {...{ fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
  '/book': <svg width="15" height="15" viewBox="0 0 24 24" {...{ fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  '/consultations': <svg width="15" height="15" viewBox="0 0 24 24" {...{ fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  '/grading/p2': <svg width="15" height="15" viewBox="0 0 24 24" {...{ fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>,
  '/publish': <svg width="15" height="15" viewBox="0 0 24 24" {...{ fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  '/cohort': <svg width="15" height="15" viewBox="0 0 24 24" {...{ fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>,
  '/rubrics': <svg width="15" height="15" viewBox="0 0 24 24" {...{ fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="9" y1="10" x2="9" y2="20"/><line x1="15" y1="10" x2="15" y2="20"/></svg>,
  '/reports': <svg width="15" height="15" viewBox="0 0 24 24" {...{ fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
};

function navIcon(href: string): ReactNode {
  return ICONS[href] ?? ICONS['/'];
}

/**
 * Which area of the system a path belongs to. The answer becomes a hue: the
 * rail item, the rule under the page title, the line under a table header and
 * the wash behind the page all take it, so a screen is recognisable before a
 * word of it is read. Status colours are untouched by this.
 */
function sectionOf(path: string): string {
  if (path === '/' || path.startsWith('/me') || path.startsWith('/cohort')) return 'home';
  if (path.startsWith('/topics')) return 'topics';
  if (path.startsWith('/book')) return 'book';
  if (path.startsWith('/consultations')) return 'consultations';
  // The marking sheet and the form it is built from belong to the same hue.
  if (path.startsWith('/grading') || path.startsWith('/marks') || path.startsWith('/rubrics')) return 'grading';
  if (path.startsWith('/publish')) return 'publish';
  if (path.startsWith('/reports')) return 'reports';
  return 'home';
}

/** Is `href` the page being viewed? '/' must match exactly or it matches all. */
function isCurrent(href: string, path: string): boolean {
  return href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
}

function initials(name: string | undefined): string {
  if (!name) return '—';
  const parts = name.replace(/^(Dr|Mr|Ms|Mrs|Prof)\.?\s+/i, '').split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return (first + last).toUpperCase() || '—';
}

async function signOut() {
  'use server';
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (raw) destroySession(raw.split('.')[0]!);
  jar.delete(COOKIE);
  redirect('/login');
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');
  const person = findPerson(principal.userId);
  // Set by src/middleware.ts. Falls back to '/' if middleware is bypassed.
  const path = (await headers()).get('x-pathname') ?? '/';
  const isStudent = Boolean(person?.studentId);

  const tabs: Array<[string, string]> = isStudent
    ? [['/me', 'My dashboard'], ['/topics', 'Topics'], ['/book', 'Book a session']]
    : [['/', 'Supervisees'], ['/topics', 'My topics'], ['/book', 'My availability']];
  if (!isStudent && principal.permissions.includes('consultation.grade')) {
    tabs.push(['/consultations', 'Consultations']);
  }
  if (principal.permissions.includes('presentation.grade')) tabs.push(['/grading/p2', 'Grade session list']);
  if (principal.permissions.includes('mark.publish')) tabs.push(['/publish', 'Release results']);
  if (principal.permissions.includes('config.edit')) {
    tabs.push(['/cohort', 'Cohort register']);
    tabs.push(['/rubrics', 'Assessment forms']);
  }
  tabs.push(['/reports', 'Reports']);

  return (
    <div className="shell" data-section={sectionOf(path)}>
      <a className="sr-only skip" href="#main">Skip to content</a>
      <aside className="rail">
        {/* Menu state for narrow screens. A checkbox rather than a script, so the
            shell opens on the same connections the rest of the app is built for. */}
        <input className="nav-toggle" type="checkbox" id="nav-toggle" aria-label="Show navigation" />
        <div className="brand">
          <span className="mark"><span className="logo">RC</span> University of Eswatini</span>
          <span className="sub">Computer Science<br />Research project supervision</span>
          <label className="nav-toggle-btn" htmlFor="nav-toggle">Menu</label>
        </div>
        <nav aria-label="Sections">
          {tabs.map(([href, label]) => {
            const on = isCurrent(href, path);
            return (
              <Link key={href} href={href} className={on ? 'on' : undefined}
                    aria-current={on ? 'page' : undefined}>
                {navIcon(href)}{label}
              </Link>
            );
          })}
        </nav>
        <div className="foot">
          <span className="avatar" aria-hidden="true">{initials(person?.fullName)}</span>
          <div className="who-line">
            <div className="who">{person?.fullName}</div>
            <div className="roles">
              {principal.roles.join(', ').toLowerCase()}
              {principal.mfaSatisfied && ' · 2FA'}
            </div>
            <form action={signOut}>
              <button className="link" type="submit">Sign out</button>
            </form>
          </div>
        </div>
      </aside>
      <div className="content">
        <main id="main">{children}</main>
      </div>
    </div>
  );
}
