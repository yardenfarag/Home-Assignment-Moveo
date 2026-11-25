/**
 * @module core/stats/weatherStats
 *
 * Pure functions behind the `get_weather_stat` tool: turn a requested period
 * into exact dates (clipped to the data we have, with notes), and count
 * hazard days in it. Percentages are of days WITH data, and coverage is
 * reported so the agent can be honest about gaps.
 */
import type { DailyWeather } from "../domain/weather";
import { countMetricDays, type DateWindow } from "../scoring/observedSignals";
import type { DayMetricId } from "../scoring/dayMetrics";
import { addDays, daysInclusive } from "../utils/dates";

/** A period as the tool receives it. `month` (1–12) narrows a year. */
export type PeriodRequest =
  | { kind: "year"; year: number; month?: number }
  | { kind: "range"; startDate: string; endDate: string }
  | { kind: "last12Months" };

/** A resolved period: exact dates, a human label, and notes about clipping. */
export interface ResolvedPeriod extends DateWindow {
  label: string;
  notes: string[];
}

/** The range of dates we have data for. */
export interface DataBounds {
  earliest: string;
  latest: string;
}

/** English month names, January first (index = month − 1). */
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * The last day of a calendar month (handles leap years and December).
 * @param year - the year, e.g. 2024.
 * @param month - the month, 1–12.
 * @returns the last day of that month, `YYYY-MM-DD`.
 */
function lastDayOfMonth(year: number, month: number): string {
  return addDays(`${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, "0")}-01`, -1);
}

/**
 * Resolves a requested period to exact dates within the available data.
 * @param request - year (optionally a month), date range, or last 12 months.
 * @param bounds - earliest and latest stored day.
 * @returns the dates, a label and notes (e.g. "2026 is incomplete").
 * @throws Error with a user-readable message when the period has no data or is malformed.
 */
export function resolvePeriod(request: PeriodRequest, bounds: DataBounds): ResolvedPeriod {
  let start: string;
  let end: string;
  let label: string;

  if (request.kind === "last12Months") {
    end = bounds.latest;
    start = addDays(end, -364);
    label = `the last 12 months (${start} to ${end})`;
  } else if (request.kind === "year") {
    const { year, month } = request;
    if (month !== undefined && (month < 1 || month > 12)) throw new Error(`Month must be 1–12, got ${month}.`);
    start = month ? `${year}-${String(month).padStart(2, "0")}-01` : `${year}-01-01`;
    end = month ? lastDayOfMonth(year, month) : `${year}-12-31`;
    label = month ? `${MONTHS[month - 1]} ${year}` : `calendar year ${year}`;
  } else {
    start = request.startDate;
    end = request.endDate;
    if (daysInclusive(start, end) === 0) throw new Error(`The end date ${end} is before the start date ${start}.`);
    label = `${start} to ${end}`;
  }

  if (end < bounds.earliest || start > bounds.latest) {
    throw new Error(`No weather data for ${label}: our data starts ${bounds.earliest} and ends ${bounds.latest}.`);
  }

  const notes: string[] = [];
  if (start < bounds.earliest) {
    notes.push(`Our data starts ${bounds.earliest}, so the period was shortened to begin then.`);
    start = bounds.earliest;
  }
  if (end > bounds.latest) {
    notes.push(`The period is incomplete: data runs through ${bounds.latest}.`);
    end = bounds.latest;
  }
  return { start, end, label, notes };
}

/** Result of counting one metric over a period. */
export interface WeatherStat {
  daysMeeting: number;
  daysWithData: number;
  daysInPeriod: number;
  /** daysMeeting ÷ daysWithData × 100, 1 decimal (null when no data). */
  percentOfDays: number | null;
  /** daysWithData ÷ daysInPeriod (0..1). */
  coverage: number;
}

/**
 * Counts days meeting a metric in a period.
 * @param days - daily rows (rows outside the period are ignored).
 * @param metricId - which hazard-day metric.
 * @param period - the exact dates.
 * @returns counts, percentage and coverage.
 */
export function computeWeatherStat(days: DailyWeather[], metricId: DayMetricId, period: DateWindow): WeatherStat {
  const inPeriod = days.filter((day) => day.date >= period.start && day.date <= period.end);
  const { hits, present } = countMetricDays(inPeriod, metricId);
  const daysInPeriod = daysInclusive(period.start, period.end);
  return {
    daysMeeting: hits,
    daysWithData: present,
    daysInPeriod,
    percentOfDays: present === 0 ? null : Math.round((hits / present) * 1000) / 10,
    coverage: daysInPeriod === 0 ? 0 : Math.round((present / daysInPeriod) * 1000) / 1000,
  };
}

/** Hazard days in one calendar month. */
export interface MonthlyCount {
  /** `YYYY-MM`. */
  month: string;
  /** e.g. "Jan 2025". */
  label: string;
  daysMeeting: number;
  daysWithData: number;
}

/**
 * Counts metric days per calendar month across a period (every month in the
 * period is listed, even with no data), for the seasonality strip.
 * @param days - daily rows (rows outside the period are ignored).
 * @param metricId - which hazard-day metric.
 * @param period - the exact dates.
 * @returns one entry per month, oldest first.
 */
export function computeMonthlyCounts(days: DailyWeather[], metricId: DayMetricId, period: DateWindow): MonthlyCount[] {
  const months: MonthlyCount[] = [];
  let cursor = `${period.start.slice(0, 7)}-01`;
  while (cursor <= period.end) {
    const month = cursor.slice(0, 7);
    const inMonth = days.filter((d) => d.date.startsWith(month) && d.date >= period.start && d.date <= period.end);
    const { hits, present } = countMetricDays(inMonth, metricId);
    months.push({ month, label: `${MONTHS[Number(month.slice(5)) - 1].slice(0, 3)} ${month.slice(0, 4)}`, daysMeeting: hits, daysWithData: present });
    cursor = addDays(lastDayOfMonth(Number(month.slice(0, 4)), Number(month.slice(5))), 1);
  }
  return months;
}
