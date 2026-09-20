/**
 * Decimal-safe helpers.
 *
 * Marks are money-like: 67.05 must round to 67.1, not 67.0. Binary floating
 * point accumulates error across the component sum, so snap to 12 significant
 * decimals before rounding, then round half-up via decimal string re-parsing
 * rather than Math.round on the raw double.
 */

export function roundHalfUp(value: number, dp = 1): number {
  if (!Number.isFinite(value)) throw new RangeError('roundHalfUp: non-finite');
  const snapped = Number(value.toFixed(12));
  const shifted = Number(`${snapped}e${dp}`);
  const rounded = Math.sign(shifted) * Math.round(Math.abs(shifted));
  return Number(`${rounded}e${-dp}`);
}

/** Kill accumulated float noise without changing the value's meaning. */
export function snap(value: number): number {
  return Number(value.toFixed(12));
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) throw new RangeError('mean: empty');
  return snap(values.reduce((a, b) => a + b, 0) / values.length);
}

export function median(values: readonly number[]): number {
  if (values.length === 0) throw new RangeError('median: empty');
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : snap((s[mid - 1]! + s[mid]!) / 2);
}

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * The single normalisation rule. Every raw rubric total passes through here.
 * Never compare or average raw totals — P1 is out of 40, P2 out of 80.
 */
export function normalisePercentage(rawTotal: number, rubricMax: number): number {
  if (!(rubricMax > 0)) throw new RangeError('normalisePercentage: rubricMax must be > 0');
  if (rawTotal < 0 || rawTotal > rubricMax) {
    throw new RangeError(`normalisePercentage: ${rawTotal} outside 0..${rubricMax}`);
  }
  return snap((rawTotal / rubricMax) * 100);
}
