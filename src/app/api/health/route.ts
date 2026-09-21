import { PROFILE_A, PROFILE_B, validateConfig } from '@/lib/assessment';
import { REPORTS } from '@/lib/reports';
import { ensureHydrated, persistenceHealth } from '@/lib/data/store';

export const dynamic = 'force-dynamic';

/**
 * Used by the container HEALTHCHECK. Reports unhealthy if a shipped policy
 * profile fails its own invariants — a bad config must not serve traffic.
 */
export async function GET() {
  const errors = [...validateConfig(PROFILE_A), ...validateConfig(PROFILE_B)];
  // A replacement machine whose database is not reachable must not take
  // traffic: it would be serving seed data in place of the real marks.
  await ensureHydrated();
  const persistence = persistenceHealth();
  const healthy = errors.length === 0 && persistence.health !== 'unreachable';
  return Response.json(
    {
      status: healthy ? 'ok' : 'degraded',
      profiles: [PROFILE_A.profileCode, PROFILE_B.profileCode],
      reports: REPORTS.length,
      configErrors: errors,
      persistence: {
        state: persistence.health,
        lastSavedAt: persistence.lastSavedAt,
        lastError: persistence.lastError,
      },
      time: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
