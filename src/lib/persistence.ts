import { prisma } from "./prisma";

const SNAPSHOT_KEY = "working-state";

/**
 * Durable persistence of the in-memory store's working tables. The store keeps
 * its synchronous in-memory accessors (fast, and the test suite runs without a
 * database); this layer hydrates those tables from Postgres on boot and writes
 * them back on mutation so data survives a restart.
 */

export type PersistedState = Record<string, unknown>;

// Persistence is opt-in at runtime: it needs a DATABASE_URL and is disabled
// under the test runner so `npm test` (which exercises the store heavily) never
// writes into a real database.
const PERSISTENCE_ENABLED =
  process.env.NODE_ENV !== "test" && Boolean(process.env.DATABASE_URL);

export async function loadPersistedState(): Promise<PersistedState | null> {
  if (!PERSISTENCE_ENABLED) return null;
  try {
    const row = await prisma.storeState.findUnique({ where: { key: SNAPSHOT_KEY } });
    if (!row) return null;
    return (row.payload ?? null) as PersistedState | null;
  } catch {
    return null; // no database reachable — stay in-memory
  }
}

export async function savePersistedState(payload: PersistedState): Promise<void> {
  if (!PERSISTENCE_ENABLED) return;
  try {
    await prisma.storeState.upsert({
      where: { key: SNAPSHOT_KEY },
      create: { key: SNAPSHOT_KEY, payload: payload as never },
      update: { payload: payload as never },
    });
  } catch {
    // best-effort: persistence is unavailable (tests, or DB down)
  }
}
