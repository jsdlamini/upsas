import { currentPrincipal } from './auth/current';

/**
 * Resolve the request's tenant from the signed-in account. Falls back to the
 * host tenant 'default' for contexts without a session (the login/register
 * pages, build-time prerender, background emails) where no tenant can be
 * known from the URL because the platform shares one hostname.
 */
export async function requestTenantId(): Promise<string> {
  try {
    const principal = await currentPrincipal();
    return principal?.tenantId ?? 'default';
  } catch {
    return 'default';
  }
}
