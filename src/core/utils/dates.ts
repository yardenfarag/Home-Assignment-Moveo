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

/** English month names, January first (index = month − 1). */
export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * The last day of a calendar month (handles leap years and December).
 * @param year - the year, e.g. 2024.
 * @param month - the month, 1–12.
 * @returns the last day of that month, `YYYY-MM-DD`.
 */
export function lastDayOfMonth(year: number, month: number): string {
  return addDays(`${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, "0")}-01`, -1);
}

/**
 * A calendar month's short label.
 * @param month - `YYYY-MM`.
 * @returns e.g. "Jan 2025".
 */
export function monthLabel(month: string): string {
  return `${MONTH_NAMES[Number(month.slice(5, 7)) - 1].slice(0, 3)} ${month.slice(0, 4)}`;
}

/**
 * Calendar days of a month that fall inside a period.
 * @param month - `YYYY-MM`.
 * @param start - period start, `YYYY-MM-DD`.
 * @param end - period end, `YYYY-MM-DD`.
 * @returns the count (0 when the month is outside the period).
 */
export function daysOfMonthInPeriod(month: string, start: string, end: string): number {
  const first = `${month}-01`;
  const last = lastDayOfMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)));
  // ISO dates compare correctly as text; clip the month to the period.
  return daysInclusive(start > first ? start : first, end < last ? end : last);
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
