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

interface Workflow {
  key: RoleCode;
  title: string;
  blurb: string;
  steps: string[];
}

const ROLE_WORKFLOWS: Workflow[] = [
  {
    key: 'STUDENT',
    title: 'Student',
    blurb: 'Choose a topic and see your project through to a released result.',
    steps: [
      'Browse and rank published topics',
      'Get allocated to a project and supervisor',
      'Book consultations and confirm each session',
      'Attend presentations when nominated',
      'See your final mark once results are released',
    ],
  },
  {
    key: 'SUPERVISOR',
    title: 'Supervisor',
    blurb: 'Publish topics and carry each supervisee from allocation to a final mark.',
    steps: [
      'Publish and manage research topics',
      'Grade and attest consultation sessions',
      'Nominate students for presentation',
      'Mark the written documentation',
      'Watch live computed marks on your supervisees',
    ],
  },
  {
    key: 'ASSESSOR',
    title: 'Assessor',
    blurb: 'Grade the students on your scheduled session list against the marking grid.',
    steps: [
      'Open your grade session list',
      'Grade each presentation on the grid',
      'Submit marks for moderation',
    ],
  },
  {
    key: 'MODERATOR',
    title: 'Moderator',
    blurb: 'Review submitted marks for fairness — never your own work.',
    steps: [
      'Review presentation and documentation marks',
      'Agree or adjust against the marking grid',
      'Leave a moderation trail',
    ],
  },
  {
    key: 'COORDINATOR',
    title: 'Coordinator / administrator',
    blurb: 'Run the cycle: allocation, scheduling, release and the institution behind it.',
    steps: [
      'Approve staff accounts',
      'Allocate topics and schedule presentations',
      'Edit the cohort register and assessment forms',
      'Compute and release results',
      'Configure the institution and read reports',
    ],
  },
  {
    key: 'EXTERNAL_EXAMINER',
    title: 'External examiner',
    blurb: 'Read the audit trail and verify that standards hold.',
    steps: [
      'Read the audit trail',
      'Review released results and reports',
    ],
  },
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
  const department = inst.department.trim();
  const yourRoles = principal.roles.map((r) => ROLE_LABELS[r] ?? r);
  const links = startLinks(principal.roles);

  return (
    <>
      <h1 className="page">Welcome to {site}</h1>
      <p className="lede">
        This is the single system of record for research-project supervision and assessment
        {department ? ` at ${department}` : ''}. A project starts as a published topic and ends as
        a released mark. Allocation, consultations, grading, moderation and results all live here,
        so everyone works from the same register — nothing is held in separate spreadsheets or
        email threads.
      </p>

      <div className="notice" role="status">
        Signed in as <strong>{person?.fullName ?? 'you'}</strong>
        {yourRoles.length > 0 && <> · {yourRoles.join(', ').toLowerCase()}</>}.
      </div>

      {links.length > 0 && (
        <>
          <h2>Start here</h2>
          <div className="card-grid">
            {links.map((l) => (
              <Link key={l.href + l.label} href={l.href} className="box start-card">
                <strong>{l.label}<span className="go" aria-hidden="true">→</span></strong>
                <span className="muted">{l.note}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      <h2>How a project moves through the system</h2>
      <div className="steps">
        <span><b>1</b> Topics published &amp; allocated</span>
        <span><b>2</b> Consultations graded &amp; attested</span>
        <span><b>3</b> Presentations assessed</span>
        <span><b>4</b> Marks moderated</span>
        <span><b>5</b> Results released</span>
      </div>

      <h2>What each role does</h2>
      <div className="card-grid">
        {ROLE_WORKFLOWS.map((w) => {
          const mine = principal.roles.includes(w.key);
          return (
            <div key={w.key} className={`box role-card${mine ? ' mine' : ''}`}>
              <strong className="role-title">
                {w.title}
                {mine && <span className="ui-badge ui-badge-info">Your role</span>}
              </strong>
              <p className="muted role-blurb">{w.blurb}</p>
              <ul className="role-steps">
                {w.steps.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </div>
          );
        })}
      </div>
    </>
  );
}
