/**
 * @module core/utils/dates
 *
 * Tiny pure helpers for calendar dates written as ISO strings (`YYYY-MM-DD`).
 * All math is done in UTC so results never depend on the server's timezone.
 */

/** Matches a calendar date like `2025-01-31`. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Milliseconds in one (UTC) day. */
export const MS_PER_DAY = 86_400_000;

/**
 * Parses an ISO date into a UTC timestamp, throwing on bad input. Impossible
 * dates (`2025-02-30`) are rejected too: `Date.parse` would silently roll them
 * over to the next month, so the parsed date must format back to the input.
 * @param isoDate - `YYYY-MM-DD`.
 * @returns milliseconds since epoch at 00:00 UTC.
 * @throws Error when the text is not a real calendar date.
 */
function toUtcMs(isoDate: string): number {
  if (!ISO_DATE.test(isoDate)) throw new Error(`Invalid ISO date: ${isoDate}`);
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== isoDate) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }
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
 * The calendar date at a moment, as seen in a timezone (e.g. 06:00 UTC on Nov 25
 * is still Nov 24 in Los Angeles).
 * @param date - the moment.
 * @param timeZone - IANA timezone, e.g. `America/Denver`.
 * @returns the local calendar date `YYYY-MM-DD`.
 * @throws RangeError when the timezone is unknown.
 */
export function isoDateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  /** One numeric part of the formatted date. */
  const part = (type: "year" | "month" | "day") => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * Adds (or subtracts) whole days.
 * @param isoDate - start date `YYYY-MM-DD`.
 * @param days - days to add (negative to subtract).
 * @returns the shifted date.
 */
export function addDays(isoDate: string, days: number): string {
  return toIsoDate(new Date(toUtcMs(isoDate) + days * MS_PER_DAY));
}

/**
 * Counts days from `start` to `end`, both included (`2025-01-01`..`2025-01-01` = 1).
 * @param start - first day.
 * @param end - last day.
 * @returns number of days, or 0 when `end` is before `start`.
 */
export function daysInclusive(start: string, end: string): number {
  const diff = Math.round((toUtcMs(end) - toUtcMs(start)) / MS_PER_DAY) + 1;
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
