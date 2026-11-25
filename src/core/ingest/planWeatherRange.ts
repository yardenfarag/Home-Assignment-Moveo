/**
 * @module core/ingest/planWeatherRange
 *
 * Decides which days to fetch for one hub, so each run is incremental:
 * - nothing stored yet → everything from the history start to yesterday;
 * - otherwise → any missing days, plus the last N days again (the archive
 *   revises its newest values).
 */
import { addDays, daysInclusive, minDate } from "../utils/dates";

/** Inputs for {@link planWeatherRange}. */
export interface PlanInput {
  /** Newest date already stored for the hub, or null if none. */
  latestStoredDate: string | null;
  /** Today's date (UTC) `YYYY-MM-DD`. We fetch up to yesterday. */
  today: string;
  /** First day of history we keep. */
  historyStart: string;
  /** How many recent days to re-fetch every run. */
  refetchRecentDays: number;
}

/** A date range to fetch, both ends included. */
export interface DateRange {
  startDate: string;
  endDate: string;
}

/**
 * Plans the date range to fetch for one hub.
 * @param input - what's stored, today's date and the policy settings.
 * @returns the range to fetch, or null when there is nothing to do.
 */
export function planWeatherRange(input: PlanInput): DateRange | null {
  const endDate = addDays(input.today, -1);
  if (daysInclusive(input.historyStart, endDate) === 0) return null;

  if (input.latestStoredDate === null) return { startDate: input.historyStart, endDate };

  const firstMissing = addDays(input.latestStoredDate, 1);
  const refetchFrom = addDays(endDate, -(input.refetchRecentDays - 1));
  const startDate = [firstMissing, refetchFrom].reduce(minDate);
  const clampedStart = daysInclusive(input.historyStart, startDate) === 0 ? input.historyStart : startDate;
  return daysInclusive(clampedStart, endDate) === 0 ? null : { startDate: clampedStart, endDate };
}
