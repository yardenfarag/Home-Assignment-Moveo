/**
 * @module core/utils/stats
 *
 * Small pure statistics helpers.
 */

/**
 * Percentile with linear interpolation between closest ranks (the common
 * "type 7" definition used by Excel's PERCENTILE.INC and Postgres percentile_cont).
 * @param values - numbers (any order; not modified).
 * @param p - percentile as a fraction, 0..1 (0.95 = 95th percentile).
 * @returns the interpolated percentile.
 * @throws Error on an empty list or p outside 0..1.
 */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) throw new Error("percentile of an empty list");
  if (p < 0 || p > 1) throw new Error(`percentile p must be within 0..1, got ${p}`);
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

/**
 * Rounds to a fixed number of decimals (avoids float noise like 0.30000000000000004).
 * @param value - number to round.
 * @param decimals - digits after the point.
 * @returns the rounded number.
 */
export function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
