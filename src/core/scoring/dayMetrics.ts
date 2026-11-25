/**
 * @module core/scoring/dayMetrics
 *
 * The ONE definition of every "hazard day" (D20, D20a, D50): which weather
 * variable it reads, the test it applies, and how its threshold is written in
 * both unit systems. Used by scoring (observedSignals) AND the weather-stat
 * tool, so the two can never disagree about what a "snow day" is.
 */
import type { DailyWeather } from "../domain/weather";
import { celsiusToFahrenheit, cmToInches, formatNumber, kmhToMph, mmToInches, type DualText } from "../utils/units";
import { DAY_THRESHOLDS as T } from "./config";

/** Weather variables a day metric can read. */
export type WeatherVariable = Exclude<keyof DailyWeather, "date">;

/** Definition of one hazard-day metric. */
export interface DayMetric {
  /** Plain name, e.g. "heavy-snow day". */
  label: string;
  variable: WeatherVariable;
  /** True when a day's value meets the threshold. */
  meets: (value: number) => boolean;
  /** The threshold written in both systems, e.g. { metric: "≥ 15 cm of snow", us: "≥ 5.9 in of snow" }. */
  threshold: DualText;
  /** Whether the metric feeds the score (false = reported stat only). */
  scored: boolean;
  /** For reported-only metrics: why it is not scored (shown to users as a caveat). */
  notScoredBecause?: string;
}

/** Every day metric the agent can report, keyed by its tool-facing id. */
export const DAY_METRICS = {
  snow_day: {
    label: "snow day",
    variable: "snowfallCm",
    meets: (v) => v >= T.snowDayCm,
    threshold: { metric: `≥ ${T.snowDayCm} cm of snow`, us: `≥ ${formatNumber(cmToInches(T.snowDayCm))} in of snow` },
    scored: true,
  },
  measurable_snow_day: {
    label: "measurable-snow day",
    variable: "snowfallCm",
    meets: (v) => v >= T.measurableSnowDayCm,
    threshold: {
      metric: `≥ ${formatNumber(T.measurableSnowDayCm, 2)} cm of snow`,
      us: `≥ ${formatNumber(cmToInches(T.measurableSnowDayCm))} in of snow`,
    },
    scored: false,
    notScoredBecause: `it answers "did it snow?"; the winter score counts snow days of ≥ ${formatNumber(cmToInches(T.snowDayCm))} in (${T.snowDayCm} cm) instead`,
  },
  heavy_snow_day: {
    label: "heavy-snow day",
    variable: "snowfallCm",
    meets: (v) => v >= T.heavySnowDayCm,
    threshold: { metric: `≥ ${T.heavySnowDayCm} cm of snow`, us: `≥ ${formatNumber(cmToInches(T.heavySnowDayCm))} in of snow` },
    scored: false,
    notScoredBecause: "modeled data likely undercounts it, so it is not used in the risk score",
  },
  extreme_cold_day: {
    label: "extreme-cold day",
    variable: "tempMinC",
    meets: (v) => v <= T.extremeColdC,
    threshold: {
      metric: `minimum ≤ ${T.extremeColdC} °C`,
      us: `minimum ≤ ${formatNumber(celsiusToFahrenheit(T.extremeColdC), 0)} °F`,
    },
    scored: true,
  },
  heavy_rain_day: {
    label: "heavy-rain day",
    variable: "precipitationMm",
    meets: (v) => v >= T.heavyRainMm,
    threshold: { metric: `≥ ${T.heavyRainMm} mm of rain`, us: `≥ ${formatNumber(mmToInches(T.heavyRainMm))} in of rain` },
    scored: true,
  },
  gust_advisory_day: {
    label: "advisory-level gust day",
    variable: "windGustMaxKmh",
    meets: (v) => v >= T.gustAdvisoryKmh,
    threshold: { metric: `gusts ≥ ${T.gustAdvisoryKmh} km/h`, us: `gusts ≥ ${formatNumber(kmhToMph(T.gustAdvisoryKmh), 0)} mph` },
    scored: true,
  },
  gust_warning_day: {
    label: "warning-level gust day",
    variable: "windGustMaxKmh",
    meets: (v) => v >= T.gustWarningKmh,
    threshold: { metric: `gusts ≥ ${T.gustWarningKmh} km/h`, us: `gusts ≥ ${formatNumber(kmhToMph(T.gustWarningKmh), 0)} mph` },
    scored: false,
    notScoredBecause: "modeled data likely undercounts it, so it is not used in the risk score",
  },
  extreme_heat_day: {
    label: "extreme-heat day",
    variable: "apparentTempMaxC",
    meets: (v) => v >= T.extremeHeatApparentC,
    threshold: {
      metric: `feels-like ≥ ${T.extremeHeatApparentC} °C`,
      us: `feels-like ≥ ${formatNumber(celsiusToFahrenheit(T.extremeHeatApparentC), 0)} °F`,
    },
    scored: true,
  },
} as const satisfies Record<string, DayMetric>;

/** Tool-facing metric id, e.g. `snow_day`. */
export type DayMetricId = keyof typeof DAY_METRICS;

/** All metric ids, for Zod enums. */
export const DAY_METRIC_IDS = Object.keys(DAY_METRICS) as [DayMetricId, ...DayMetricId[]];
