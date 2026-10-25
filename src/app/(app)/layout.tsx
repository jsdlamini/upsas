import { redirect } from 'next/navigation';
import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { NavLinks } from '@/components/nav-links';
import { sectionOf } from '@/lib/nav/section';
import { MeetingNotices } from '@/components/meeting-notices';
import { NotificationBell } from '@/components/notification-bell';
import type { ReactNode } from 'react';
import { currentPrincipal, destroySession, COOKIE, identityFor } from '@/lib/auth/current';
import { noticesFor, persistenceHealth } from '@/lib/data/store';
import { getInstitution, monogramText, logoUrl } from '@/lib/institution';

export const dynamic = 'force-dynamic';

/**
 * Rail icons: one consistent 16×16 set, 1.8px rounded strokes, drawn from the
 * same visual grammar (Lucide-style) so the rail reads as one instrument
 * panel. Each destination has its own glyph — the old set reused the same
 * grid tile for Supervisees, My dashboard and Institution, which made the
 * rail impossible to scan.
 */
function railIcon(children: ReactNode): ReactNode {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

const ICONS: Record<string, ReactNode> = {
  // Supervisees (staff home) — the people you supervise
  '/': railIcon(<>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </>),
  // My dashboard (student home) — a house, unmistakably
  '/me': railIcon(<>
    <path d="M3 10.8 12 3l9 7.8" />
    <path d="M5.2 9.5V21h13.6V9.5" />
    <path d="M9.8 21v-5.4h4.4V21" />
  </>),
  // Topics — an open book
  '/topics': railIcon(<>
    <path d="M2 4.5h6.5A3.5 3.5 0 0 1 12 8v13a3 3 0 0 0-3-3H2z" />
    <path d="M22 4.5h-6.5A3.5 3.5 0 0 0 12 8v13a3 3 0 0 1 3-3h7z" />
  </>),
  // Availability / booking — a calendar
  '/book': railIcon(<>
    <rect x="3" y="4.5" width="18" height="17" rx="2" />
    <path d="M8 2.5v4M16 2.5v4M3 10h18" />
  </>),
  // Consultations — a conversation
  '/consultations': railIcon(<>
    <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </>),
  // Grading — a clipboard with rows
  '/grading/p2': railIcon(<>
    <rect x="8" y="2.5" width="8" height="3.5" rx="1" />
    <path d="M16 4.5h2a2 2 0 0 1 2 2V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2h2" />
    <path d="M12 11h4M12 16h4M8 11h.01M8 16h.01" />
  </>),
  // Release results — send
  '/publish': railIcon(<>
    <path d="M22 2 11 13" />
    <path d="M22 2 15 22l-4-9-9-4z" />
  </>),
  // Cohort register — graduation cap
  '/cohort': railIcon(<>
    <path d="M22 9.5 12 4.5l-10 5 10 5 10-5z" />
    <path d="M6 12v4.6c0 1.6 2.7 2.9 6 2.9s6-1.3 6-2.9V12" />
  </>),
  // Assessment forms — list with checks
  '/rubrics': railIcon(<>
    <path d="m3 8 2 2 4-4" />
    <path d="m3 17 2 2 4-4" />
    <path d="M13 7h8M13 17h8" />
  </>),
  // Institution settings — sliders
  '/settings': railIcon(<>
    <path d="M21 5h-7M10 5H3M21 12h-9M8 12H3M21 19h-5M12 19H3" />
    <path d="M14 3v4M8 10v4M16 17v4" />
  </>),
  // People (approvals) — user with a check
  '/people': railIcon(<>
    <path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="8.5" cy="7" r="4" />
    <path d="m16.5 11.5 2 2 4-4" />
  </>),
  // Institutions (host console) — a building
  '/admin': railIcon(<>
    <rect x="4.5" y="3" width="15" height="18" rx="1.5" />
    <path d="M9.5 21v-3.5h5V21" />
    <path d="M8.5 7h.01M12 7h.01M15.5 7h.01M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01" />
  </>),
  // Reports — a filed document
  '/reports': railIcon(<>
    <path d="M14 2.5H6a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.5z" />
    <path d="M14 2.5v6h6" />
    <path d="M16 13.5H8M16 17.5H8" />
  </>),
};

function navIcon(href: string): ReactNode {
  return ICONS[href] ?? ICONS['/'];
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

  // A machine that could not load the real state shows nothing rather than
  // seed data dressed up as the department's marks.
  const persistence = persistenceHealth();
  if (persistence.health === 'unreachable') {
    return (
      <main style={{ padding: '64px 24px', maxWidth: 640, margin: '0 auto' }}>
        <h1 className="page">The database cannot be reached</h1>
        <p className="lede">
          UPSAS will not show or accept marks until it can read the saved state, so nothing you
          see could be out of date and nothing you enter could overwrite what is stored. This
          usually clears within a minute of a server restart. Reload to try again.
        </p>
        <p className="muted" style={{ fontSize: 12.5 }}>
          For the administrator: {persistence.lastError ?? 'no detail'}
        </p>
      </main>
    );
  }
  const person = await identityFor(principal.userId);
  const inst = await getInstitution();
  const mono = await monogramText();
  const logo = await logoUrl();
  // Set by src/middleware.ts. Falls back to '/' if middleware is bypassed.
  const path = (await headers()).get('x-pathname') ?? '/';
  // Shown as a count on the booking tab, so the rail says something happened
  // even when the banners have scrolled away.
  const unseenMeetings = noticesFor(principal.userId).length;
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
    tabs.push(['/settings', 'Institution']);
  }
  if (principal.permissions.includes('user.approve')) tabs.push(['/people', 'People']);
  if (principal.tenantId === 'default' && principal.roles.includes('ADMINISTRATOR')) {
    tabs.push(['/admin', 'Institutions']);
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
          <Link href="/welcome" className="brand-link">
            <span className="mark">{logo ? <img src={logo} alt="" className="rail-logo" /> : <span className="logo">{mono}</span>} {inst.name}</span>
            <span className="sub">{inst.department}<br />Research project supervision</span>
          </Link>
          <NotificationBell userId={principal.userId} />
          <label className="nav-toggle-btn" htmlFor="nav-toggle">Menu</label>
        </div>
        <nav aria-label="Sections">
          <NavLinks items={tabs.map(([href, label]) => ({
            href, label, icon: navIcon(href),
            ...(href === '/book' && unseenMeetings > 0 ? { count: unseenMeetings } : {}),
          }))} />
        </nav>
        <div className="foot">
          <span className="avatar" aria-hidden="true">{initials(person?.fullName)}</span>
          <div className="who-line">
            <div className="who"><a href="/account" style={{ color: 'inherit', textDecoration: 'none' }}>{person?.fullName}</a></div>
            <div className="roles">
              {principal.roles.join(', ').toLowerCase()}
              {principal.mfaSatisfied && ' · 2FA'}
            </div>
            <a href="/account" className="link" style={{ fontSize: 11 }}>Edit my details</a>
            <form action={signOut}>
              <button className="link" type="submit">Sign out</button>
            </form>
          </div>
        </div>
      </aside>
      <div className="content">
        <main id="main">
          {persistence.health === 'disabled' && process.env.NODE_ENV === 'production'
            && principal.roles.some((r) => r !== 'STUDENT') && (
            <div className="notice bad" role="alert">
              <strong>Nothing is being saved durably.</strong> This server has no
              DATABASE_URL, so every mark lives only in its memory and is lost when it restarts.
            </div>
          )}
          <MeetingNotices userId={principal.userId} />
          {children}
        </main>
      </div>
    </div>
  );
}
