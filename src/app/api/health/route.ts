import { PROFILE_A, PROFILE_B, validateConfig } from '@/lib/assessment';
import { REPORTS } from '@/lib/reports';

export const dynamic = 'force-dynamic';

/**
 * Used by the container HEALTHCHECK. Reports unhealthy if a shipped policy
 * profile fails its own invariants — a bad config must not serve traffic.
 */
export function GET() {
  const errors = [...validateConfig(PROFILE_A), ...validateConfig(PROFILE_B)];
  const healthy = errors.length === 0;
  return Response.json(
    {
      status: healthy ? 'ok' : 'degraded',
      profiles: [PROFILE_A.profileCode, PROFILE_B.profileCode],
      reports: REPORTS.length,
      configErrors: errors,
      time: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
