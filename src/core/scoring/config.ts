/**
 * @module core/scoring/config
 *
 * THE single source of truth for every scoring number: day thresholds, anchors,
 * weights, the overall mix, level cut-offs and confidence rules.
 * docs/decisions.md (D19, D20, D47–D55) explains *why*; this file says *what*.
 * Changing any value here means bumping SCORING_VERSION.
 */
import type { Hazard } from "./types";

/** Bump whenever a number below changes, so history never mixes formulas (D22). */
export const SCORING_VERSION = "v1";

/** Scoring window: the last 5 years (1,826 days) ending at the newest stored day (D55). */
export const SCORING_WINDOW_DAYS = 1_826;

/** What counts as a "hazard day" (D20, checked against NWS criteria — see docs/assumptions.md). */
export const DAY_THRESHOLDS = {
  /** Snow day: daily snowfall ≥ 1 cm. */
  snowDayCm: 1,
  /** Measurable snow: ≥ 0.1 in (0.254 cm), the NWS bar below which snowfall is a "trace". Reported only (G13). */
  measurableSnowDayCm: 0.254,
  /** Heavy snow day: ≥ 15 cm. Reported stat only, NOT scored (D50). */
  heavySnowDayCm: 15,
  /** Extreme cold day: daily minimum ≤ −18 °C (0 °F). */
  extremeColdC: -18,
  /** Heavy rain day: ≥ 50 mm. */
  heavyRainMm: 50,
  /** Advisory-level gust day: max gust ≥ 72 km/h (45 mph). The scored wind signal (D20a). */
  gustAdvisoryKmh: 72,
  /** Warning-level gust day: ≥ 93 km/h (58 mph). Reported stat only, NOT scored (D20a). */
  gustWarningKmh: 93,
  /** Extreme heat day: max apparent temperature ≥ 40 °C (~105 °F). */
  extremeHeatApparentC: 40,
} as const;

/** Observed signals: days per year that map to a score of 100 (D48). 0 days = 0. */
export const OBSERVED_ANCHORS = {
  snowDays: 40,
  extremeColdDays: 30,
  heavyRainDays: 5,
  gustAdvisoryDays: 10,
  extremeHeatDays: 60,
} as const;

/**
 * FEMA signals: national 95th percentile across US counties where FEMA rates the
 * hazard (NRI v1.20, Dec 2025) → score 100 (D47). Recompute with `npm run fema:anchors`.
 * Units: events (or event-days) per year; tornado per 1,000 sq mi of county (D53).
 */
export const FEMA_ANCHORS_P95 = {
  hurricane: 0.248,
  tornadoPer1000SqMi: 0.987,
  hail: 8.169,
  inlandFlood: 3.536,
  coastalFlood: 4.917,
  iceStorm: 1.548,
  winterWeather: 25.079,
  coldWave: 10.368,
  heatWave: 17.842,
  strongWind: 6.191,
} as const;

/** FEMA NRI version the anchors were computed from. */
export const FEMA_ANCHORS_NRI_VERSION = "December 2025";

/** Business-impact weights per hazard (D19). Must sum to 1. */
export const HAZARD_WEIGHTS: Record<Hazard, number> = {
  hurricane: 0.25,
  winter: 0.2,
  flood: 0.2,
  severeStorms: 0.15,
  wind: 0.1,
  heat: 0.1,
};

/** Overall = 60% weighted average + 40% worst hazard (D19). */
export const OVERALL_MIX = { weightedAverage: 0.6, worstHazard: 0.4 } as const;

/**
 * Risk levels on the overall score rounded to a whole number (D19):
 * Low 0–33, Medium 34–66, High 67–100.
 */
export const RISK_LEVEL_CUTOFFS = { mediumFrom: 34, highFrom: 67 } as const;

/** Confidence rules (D51). */
export const CONFIDENCE_RULES = {
  /** At least this share of days present → "complete". */
  completeCoverage: 0.95,
  /** Below this share of days → Low. */
  minimumCoverage: 0.8,
  /** Observed and FEMA halves further apart than this → sources disagree → Medium. */
  disagreementPoints: 40,
} as const;
