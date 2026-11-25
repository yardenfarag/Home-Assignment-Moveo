/**
 * @module core/utils/dates
 *
 * Tiny pure helpers for calendar dates written as ISO strings (`YYYY-MM-DD`).
 * All math is done in UTC so results never depend on the server's timezone.
 */

/** Matches a calendar date like `2025-01-31`. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses an ISO date into a UTC timestamp, throwing on bad input.
 * @param isoDate - `YYYY-MM-DD`.
 * @returns milliseconds since epoch at 00:00 UTC.
 */
function toUtcMs(isoDate: string): number {
  if (!ISO_DATE.test(isoDate)) throw new Error(`Invalid ISO date: ${isoDate}`);
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(ms)) throw new Error(`Invalid ISO date: ${isoDate}`);
  return ms;
}

/**
 * Formats a Date as `YYYY-MM-DD` (UTC).
 * @param date - the date.
 * @returns the ISO calendar date.
 */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Adds (or subtracts) whole days.
 * @param isoDate - start date `YYYY-MM-DD`.
 * @param days - days to add (negative to subtract).
 * @returns the shifted date.
 */
export function addDays(isoDate: string, days: number): string {
  return toIsoDate(new Date(toUtcMs(isoDate) + days * 86_400_000));
}

/**
 * Counts days from `start` to `end`, both included (`2025-01-01`..`2025-01-01` = 1).
 * @param start - first day.
 * @param end - last day.
 * @returns number of days, or 0 when `end` is before `start`.
 */
export function daysInclusive(start: string, end: string): number {
  const diff = Math.round((toUtcMs(end) - toUtcMs(start)) / 86_400_000) + 1;
  return Math.max(0, diff);
}

/**
 * Returns the earlier of two ISO dates.
 * @param a - first date.
 * @param b - second date.
 * @returns the earlier one.
 */
export function minDate(a: string, b: string): string {
  return toUtcMs(a) <= toUtcMs(b) ? a : b;
}
