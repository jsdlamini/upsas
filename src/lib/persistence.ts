import { prisma } from "./prisma";

const SNAPSHOT_KEY = "working-state";

/**
 * Durable persistence of the in-memory store's working tables.
 *
 * The store keeps synchronous in-memory accessors (fast, and the test suite runs
 * without a database). This layer hydrates those tables from Postgres on boot
 * and writes them back so data survives the machine it runs on.
 *
 * Written for machines that disappear. Two failure modes matter, and the old
 * version had both:
 *
 *   A lost write. Errors were swallowed, so a mark could be reported saved and
 *   never reach the database. Every write now reports what actually happened,
 *   and a mark is only acknowledged once Postgres has it.
 *
 *   A clobbered database. If the database was not reachable at boot — common
 *   when a new container starts before its database is ready — the store ran
 *   on seed data, and the next save overwrote the real snapshot with it: every
 *   mark in the department gone. "No snapshot yet" and "cannot reach the
 *   database" are now different answers, and nothing is written until the real
 *   state has been loaded.
 */

export type PersistedState = Record<string, unknown>;

/**
 * Opt-in at runtime: needs a DATABASE_URL, and is off under the test runner so
 * `npm test` never writes into a real database.
 */
export function persistenceEnabled(): boolean {
  return process.env.NODE_ENV !== "test" && Boolean(process.env.DATABASE_URL);
}

export type LoadResult =
  | { status: "disabled" }
  | { status: "empty" }
  | { status: "loaded"; state: PersistedState }
  | { status: "unreachable"; error: string };

export async function loadPersistedState(): Promise<LoadResult> {
  if (!persistenceEnabled()) return { status: "disabled" };
  try {
    const row = await prisma.storeState.findUnique({ where: { key: SNAPSHOT_KEY } });
    if (!row || row.payload == null) return { status: "empty" };
    return { status: "loaded", state: row.payload as PersistedState };
  } catch (error) {
    return { status: "unreachable", error: error instanceof Error ? error.message : String(error) };
  }
}

export type SaveOutcome = "saved" | "disabled" | "failed";

export async function savePersistedState(payload: PersistedState): Promise<SaveOutcome> {
  if (!persistenceEnabled()) return "disabled";
  try {
    await prisma.storeState.upsert({
      where: { key: SNAPSHOT_KEY },
      create: { key: SNAPSHOT_KEY, payload: payload as never },
      update: { payload: payload as never },
    });
    return "saved";
  } catch (error) {
    console.error("[persist:failed]", error instanceof Error ? error.message : String(error));
    return "failed";
  }
}
