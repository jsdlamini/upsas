/**
 * Login rate limiting (brute-force protection).
 *
 * In-memory per-key limiter, pinned to globalThis so Next's dev hot-reload
 * cannot reset it. Keys are the username and the client IP. Production replaces
 * the process-local table with a shared store, but this already raises the cost
 * of password guessing from free to 10 attempts per 15 minutes.
 */

const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 10;

const globalForRate = globalThis as unknown as {
  __upsasLoginRate?: Map<string, { count: number; resetAt: number }>;
};
const RATE: Map<string, { count: number; resetAt: number }> = (globalForRate.__upsasLoginRate ??= new Map());

export interface RateDecision {
  allowed: boolean;
  retryAfterMs: number;
}

export function checkLoginRate(key: string): RateDecision {
  const now = Date.now();
  const entry = RATE.get(key);
  if (!entry || entry.resetAt <= now) {
    RATE.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterMs: 0 };
  }
  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) {
    return { allowed: false, retryAfterMs: Math.max(0, entry.resetAt - now) };
  }
  return { allowed: true, retryAfterMs: 0 };
}
