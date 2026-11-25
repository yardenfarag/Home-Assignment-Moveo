/**
 * @module core/scoring/normalize
 *
 * Turns a raw rate (days or events per year) into a 0–100 score on a fixed,
 * absolute scale: 0 → 0, the anchor → 100, linear in between, capped at 100.
 */

/**
 * Linear 0–100 score with a cap.
 * @param value - raw rate, ≥ 0.
 * @param anchor100 - the rate that scores 100, > 0.
 * @returns score in 0..100 (unrounded).
 * @throws Error on a negative/NaN value or a non-positive anchor — bad inputs must never become a quiet number.
 */
export function linearScore(value: number, anchor100: number): number {
  if (!(anchor100 > 0)) throw new Error(`linearScore: anchor must be > 0, got ${anchor100}`);
  if (!(value >= 0)) throw new Error(`linearScore: value must be a number ≥ 0, got ${value}`);
  return Math.min(100, (value / anchor100) * 100);
}
