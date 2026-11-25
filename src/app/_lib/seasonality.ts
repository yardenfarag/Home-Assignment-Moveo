/**
 * @module app/_lib/seasonality
 *
 * Prepares the seasonality strip (S6): which months have full, partial or no weather data
 * (so a month without data never looks like "0 hazard days"), and which columns get a label
 * on long, multi-year ranges.
 */
import type { MonthlyCount } from "@/core/stats/weatherStats";
import { daysOfMonthInPeriod, monthLabel } from "@/core/utils/dates";

/** How much of a month's days (inside the period) have weather data. */
export type MonthCoverage = "full" | "partial" | "none";

/** One month, ready to draw. */
export interface StripMonth {
  /** `YYYY-MM`. */
  month: string;
  /** e.g. "Jan 2025". */
  label: string;
  daysMeeting: number;
  /** Days of this month (inside the period) with weather data. */
  daysWithData: number;
  /** Calendar days of this month that fall inside the period. */
  daysInPeriod: number;
  coverage: MonthCoverage;
  /** The text under the column ("" for no label). */
  monthLabel: string;
  /** The year under the column ("'25"), on the first column and each January of a multi-year strip. */
  yearLabel: string;
}

/** Columns we can label without the labels overlapping. */
const MAX_LABELS = 12;

/**
 * Builds the strip's columns: coverage per month and thinned labels. Accepts both the compact
 * entries tools return now (`daysWithData` only when some days lack data, no `label`) and the
 * older saved ones (both always present): the label is always derived, a missing count means complete.
 * @param byMonth - hazard days per month, from get_weather_stat.
 * @param period - the period's first and last day.
 * @returns one column per month.
 */
export function stripMonths(byMonth: MonthlyCount[], period: { start: string; end: string }): StripMonth[] {
  const years = new Set(byMonth.map((m) => m.month.slice(0, 4)));
  const singleYear = years.size === 1;
  const every = Math.max(1, Math.ceil(byMonth.length / MAX_LABELS));
  return byMonth.map((m, index) => {
    const daysInPeriod = daysOfMonthInPeriod(m.month, period.start, period.end);
    const daysWithData = typeof m.daysWithData === "number" ? m.daysWithData : daysInPeriod;
    const coverage: MonthCoverage = daysWithData === 0 ? "none" : daysWithData < daysInPeriod ? "partial" : "full";
    const label = monthLabel(m.month);
    const name = label.slice(0, 3);
    const isJanuary = m.month.endsWith("-01");
    return {
      month: m.month,
      label,
      daysMeeting: m.daysMeeting,
      daysWithData,
      daysInPeriod,
      coverage,
      monthLabel: index % every === 0 ? (singleYear ? name.slice(0, 1) : name) : "",
      yearLabel: !singleYear && (index === 0 || isJanuary) ? `'${m.month.slice(2, 4)}` : "",
    };
  });
}

/**
 * The strip in words, for screen readers: the peak month, months without data, and (for up to
 * two years) every month's count.
 * @param months - the strip's columns.
 * @param what - e.g. "heavy-rain days".
 * @returns the description.
 */
export function describeStrip(months: StripMonth[], what: string): string {
  if (months.length === 0) return `No ${what} data for this period.`;
  const withData = months.filter((m) => m.coverage !== "none");
  const peak = withData.reduce<StripMonth | null>((best, m) => (!best || m.daysMeeting > best.daysMeeting ? m : best), null);
  const parts = [`${what[0].toUpperCase()}${what.slice(1)} per month, ${months[0].label} to ${months.at(-1)!.label}.`];
  if (peak) parts.push(peak.daysMeeting > 0 ? `Most in ${peak.label}: ${peak.daysMeeting}.` : `None in any month with data.`);
  const missing = months.length - withData.length;
  if (missing > 0) parts.push(`${missing} month${missing > 1 ? "s" : ""} without weather data.`);
  if (months.length <= 24) {
    parts.push(months.map((m) => `${m.label}: ${m.coverage === "none" ? "no data" : m.daysMeeting}`).join(", ") + ".");
  }
  return parts.join(" ");
}
