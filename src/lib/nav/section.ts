/**
 * Which part of the system a path belongs to, and which rail item it lights.
 * Shared by the server (first paint) and the browser (every navigation after).
 */

export function sectionOf(path: string): string {
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

/**
 * Is this rail item the page being viewed? Matched on the first path segment,
 * so the "Grade session list" item (which points at /grading/p2) stays lit on
 * /grading/p1 too. The root matches only itself, or it would match everything.
 */
export function isCurrent(href: string, path: string): boolean {
  const clean = path.split(/[?#]/)[0] || '/';
  if (href === '/') return clean === '/';
  const first = (p: string) => p.split('/').filter(Boolean)[0] ?? '';
  return first(href) === first(clean);
}
