import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentPrincipal, identityFor } from '@/lib/auth/current';
import { getInstitution } from '@/lib/institution';
import type { RoleCode } from '@/lib/rbac/policy';

export const dynamic = 'force-dynamic';

const ROLE_LABELS: Record<RoleCode, string> = {
  STUDENT: 'Student',
  SUPERVISOR: 'Supervisor',
  ASSESSOR: 'Assessor',
  MODERATOR: 'Moderator',
  COORDINATOR: 'Coordinator',
  ADMINISTRATOR: 'Administrator',
  EXTERNAL_EXAMINER: 'External examiner',
};

const ROLE_SUMMARIES: { key: RoleCode; title: string; blurb: string }[] = [
  { key: 'STUDENT', title: 'Student', blurb: 'Rank published topics, attend consultations, and follow your project to a released mark.' },
  { key: 'SUPERVISOR', title: 'Supervisor', blurb: 'Publish topics, run graded consultations, and carry each supervisee to a final mark.' },
  { key: 'ASSESSOR', title: 'Assessor', blurb: 'Grade your scheduled presentations against the marking grid.' },
  { key: 'MODERATOR', title: 'Moderator', blurb: 'Review submitted marks for fairness — never your own.' },
  { key: 'COORDINATOR', title: 'Coordinator / administrator', blurb: 'Run the cycle: accounts, allocation, scheduling, release and reports.' },
  { key: 'EXTERNAL_EXAMINER', title: 'External examiner', blurb: 'Read the audit trail and verify released results.' },
];

function startLinks(roles: readonly RoleCode[]): { href: string; label: string; note: string }[] {
  const isStudent = roles.includes('STUDENT') && !roles.includes('SUPERVISOR');
  const links: { href: string; label: string; note: string }[] = [];

  if (isStudent) {
    links.push(
      { href: '/topics', label: 'Choose a topic', note: 'Browse and rank topics for allocation.' },
      { href: '/book', label: 'Book a session', note: 'Book consultations with your supervisor.' },
      { href: '/me', label: 'My dashboard', note: 'Your project, deadlines and marks.' },
    );
  } else {
    links.push(
      { href: '/', label: 'My supervisees', note: 'Live marks for the students you supervise.' },
      { href: '/topics', label: 'My topics', note: 'Publish topics students can choose.' },
      { href: '/book', label: 'My availability', note: 'Set times students can book.' },
    );
  }

  if (roles.includes('SUPERVISOR')) {
    links.push({ href: '/consultations', label: 'Consultations', note: 'Grade and attest sessions.' });
  }
  if (roles.includes('ASSESSOR')) {
    links.push({ href: '/grading/p2', label: 'Grade session list', note: 'Grade scheduled presentations.' });
  }
  if (roles.includes('MODERATOR')) {
    links.push({ href: '/grading/p2', label: 'Moderate marks', note: 'Review marks — never your own.' });
  }
  if (roles.includes('COORDINATOR') || roles.includes('ADMINISTRATOR')) {
    links.push(
      { href: '/publish', label: 'Release results', note: 'Compute and publish final marks.' },
      { href: '/cohort', label: 'Cohort register', note: 'Manage the cohort for this cycle.' },
    );
  }
  if (roles.includes('ADMINISTRATOR')) {
    links.push({ href: '/settings', label: 'Institution', note: 'Configure branding and settings.' });
  }

  return links.slice(0, 6);
}

export default async function WelcomePage() {
  const principal = await currentPrincipal();
  if (!principal) redirect('/login');

  const person = await identityFor(principal.userId);
  const inst = await getInstitution();
  const site = inst.name.trim() || inst.productName || 'Research Chain';
  const yourRoles = principal.roles.map((r) => ROLE_LABELS[r] ?? r);
  const links = startLinks(principal.roles);

  return (
    <>
      <h1 className="page">Welcome to {site}</h1>
      <p className="lede">
        One record runs from published topic to released final mark — allocation,
        consultations, grading, moderation and results all live here.
      </p>

      <div className="notice" role="status">
        Signed in as <strong>{person?.fullName ?? 'you'}</strong>
        {yourRoles.length > 0 && <> · {yourRoles.join(', ').toLowerCase()}</>}.
      </div>

      {links.length > 0 && (
        <>
          <h2>Start here</h2>
          <nav className="quick-links" aria-label="Quick links">
            {links.map((l) => (
              <Link key={l.href + l.label} href={l.href}>
                <strong>{l.label}</strong>
                <small>{l.note}</small>
              </Link>
            ))}
          </nav>
        </>
      )}

      <h2>How the cycle runs</h2>
      <p className="muted cycle-note">
        Topics are published and allocated, consultations are graded and attested,
        presentations are assessed, marks are moderated, and results are released.
      </p>

      <h2>Roles in this workspace</h2>
      <ul className="role-list">
        {ROLE_SUMMARIES.map((r) => {
          const mine = principal.roles.includes(r.key);
          return (
            <li key={r.key} className={mine ? 'mine' : undefined}>
              <strong>{r.title}</strong>
              <span className="muted">{r.blurb}</span>
              {mine && <span className="ui-badge ui-badge-info">Your role</span>}
            </li>
          );
        })}
      </ul>
    </>
  );
}
