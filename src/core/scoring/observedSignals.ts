/**
 * @module core/scoring/observedSignals
 *
 * Turns daily weather rows into per-year "hazard day" rates for the scoring
 * window. Rates use only days that actually have a value:
 *   rate = days meeting the threshold × 365.25 ÷ days with data   (D55)
 * so a few missing days don't drag a hub's rate down; coverage is reported
 * separately and feeds confidence (D51).
 */
import type { DailyWeather } from "../domain/weather";
import { addDays, daysInclusive } from "../utils/dates";
import { SCORING_WINDOW_DAYS } from "./config";
import { DAY_METRICS, type DayMetricId } from "./dayMetrics";

/** A closed date range `YYYY-MM-DD`..`YYYY-MM-DD`. */
export interface DateWindow {
  start: string;
  end: string;
}

/** Share of expected days that have a value, per weather variable (0..1). */
export interface WeatherCoverage {
  snowfall: number;
  tempMin: number;
  precipitation: number;
  windGust: number;
  apparentTempMax: number;
}

/** Per-year hazard-day rates (null when no day in the window had data). */
export interface PerYearRates {
  snowDays: number | null;
  /** Reported only, not scored (D50). */
  heavySnowDays: number | null;
  extremeColdDays: number | null;
  heavyRainDays: number | null;
  gustAdvisoryDays: number | null;
  /** Reported only, not scored (D20a). */
  gustWarningDays: number | null;
  extremeHeatDays: number | null;
}

/** Observed-weather inputs for one hub. */
export interface ObservedSignals {
  window: DateWindow;
  expectedDays: number;
  coverage: WeatherCoverage;
  perYear: PerYearRates;
}

/**
 * The scoring window: the last {@link SCORING_WINDOW_DAYS} days ending at `latestDate`.
 * @param latestDate - newest stored day for the hub.
 * @returns the window (both ends included).
 */
export function scoringWindow(latestDate: string): DateWindow {
  return { start: addDays(latestDate, -(SCORING_WINDOW_DAYS - 1)), end: latestDate };
}

/**
 * Counts the days that meet a metric among days that have a value for its variable.
 * Shared with the weather-stat tool so both count days identically.
 * @param days - the days to look at.
 * @param metricId - which hazard-day metric.
 * @returns days meeting the threshold and days with data.
 */
export function countMetricDays(days: DailyWeather[], metricId: DayMetricId): { hits: number; present: number } {
  const metric = DAY_METRICS[metricId];
  let present = 0;
  let hits = 0;
  for (const day of days) {
    const value = day[metric.variable];
    if (value === null) continue;
    present++;
    if (metric.meets(value)) hits++;
  }
  return { hits, present };
}

/**
 * Per-year rate of a metric: hits × 365.25 ÷ days with data.
 * @param days - the days in the window.
 * @param metricId - which hazard-day metric.
 * @returns the rate (null when no data) and how many days had data.
 */
function ratePerYear(days: DailyWeather[], metricId: DayMetricId): { rate: number | null; present: number } {
  const { hits, present } = countMetricDays(days, metricId);
  return { rate: present === 0 ? null : (hits * 365.25) / present, present };
}

/**
 * Computes observed hazard-day rates and coverage for a window.
 * @param days - daily rows (rows outside the window are ignored).
 * @param window - the scoring window.
 * @returns per-year rates and per-variable coverage.
 */
export function computeObservedSignals(days: DailyWeather[], window: DateWindow): ObservedSignals {
  const inWindow = days.filter((day) => day.date >= window.start && day.date <= window.end);
  const expectedDays = daysInclusive(window.start, window.end);

  const snow = ratePerYear(inWindow, "snow_day");
  const heavySnow = ratePerYear(inWindow, "heavy_snow_day");
  const cold = ratePerYear(inWindow, "extreme_cold_day");
  const rain = ratePerYear(inWindow, "heavy_rain_day");
  const gustAdvisory = ratePerYear(inWindow, "gust_advisory_day");
  const gustWarning = ratePerYear(inWindow, "gust_warning_day");
  const heat = ratePerYear(inWindow, "extreme_heat_day");

  /**
   * Coverage: the share of the window's days that have a value.
   * @param present - days with a value.
   * @returns 0..1.
   */
  const share = (present: number) => (expectedDays === 0 ? 0 : present / expectedDays);
  return {
    window,
    expectedDays,
    coverage: {
      snowfall: share(snow.present),
      tempMin: share(cold.present),
      precipitation: share(rain.present),
      windGust: share(gustAdvisory.present),
      apparentTempMax: share(heat.present),
    },
    perYear: {
      snowDays: snow.rate,
      heavySnowDays: heavySnow.rate,
      extremeColdDays: cold.rate,
      heavyRainDays: rain.rate,
      gustAdvisoryDays: gustAdvisory.rate,
      gustWarningDays: gustWarning.rate,
      extremeHeatDays: heat.rate,
    },
  };
}
