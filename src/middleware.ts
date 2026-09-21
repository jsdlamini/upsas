import { NextResponse, type NextRequest } from 'next/server';

/**
 * The only job here is to hand the current path to server components.
 *
 * App Router layouts cannot read the pathname, so the navigation rail had no
 * way to mark the current page — the `.on` style existed in the stylesheet and
 * was never applied to anything. Doing it here rather than in a client
 * component keeps the shell at zero JavaScript, which the rest of the app
 * already relies on.
 *
 * Authorisation is deliberately NOT done here: session checks stay in
 * `currentPrincipal()` where they run in the Node runtime with the real
 * password and audit primitives.
 */
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set('x-pathname', request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\.(?:svg|png|ico|txt)$).*)'],
};
