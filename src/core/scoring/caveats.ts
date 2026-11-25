/**
 * @module core/scoring/caveats
 *
 * Standing caveats (G4): honest limits of our data, stated plainly (D20b).
 * Tools attach them, and the answer validator guarantees the ones for every
 * hazard/metric used end up in the answer's `limitations` — the LLM can add
 * caveats but never drop these. Thresholds are built from config, never retyped.
 */
import { formatDual, type UnitSystem } from "../utils/units";
import { DAY_METRICS, type DayMetric, type DayMetricId } from "./dayMetrics";
import type { Hazard } from "./types";

/** Caveats that apply to every score answer. */
export const GENERAL_CAVEATS: readonly string[] = [
  "Scores measure exposure (how often hazardous weather hits a hub's location), not dollar losses. Hub volume, building condition and existing resilience upgrades are not included.",
  "Each hub is its metro's city-center point: weather comes from a ~10 km model grid cell, FEMA data from the county containing that point.",
];

/** Caveat for anything built on observed weather. */
export const WEATHER_DATA_CAVEAT =
  "Observed weather is modeled reanalysis (Open-Meteo), not station measurements, so it smooths out extremes.";

/**
 * Caveat for a hub whose weather data ends noticeably earlier than the other hubs'
 * (see scoring/staleness.ts), so its score is older than theirs.
 * @param hubName - the hub's display name.
 * @param windowEnd - the hub's newest weather day in its score.
 * @param newestWindowEnd - the newest day any hub has.
 * @returns the plain-language caveat.
 */
export function staleDataCaveat(hubName: string, windowEnd: string, newestWindowEnd: string): string {
  return `${hubName}'s weather data ends ${windowEnd}, earlier than the other hubs' (${newestWindowEnd}), most likely because its recent data updates failed. Its score is older and may not reflect the latest days.`;
}

/**
 * Standing caveats for one hazard.
 * @param hazard - the hazard.
 * @param units - which unit system leads in the text.
 * @returns plain-language caveats.
 */
export function hazardCaveats(hazard: Hazard, units: UnitSystem): string[] {
  const t = (id: DayMetricId) => formatDual(DAY_METRICS[id].threshold, units);
  switch (hazard) {
    case "hurricane":
      return ["Hurricane exposure comes from FEMA's long-term county frequency; any single season can be far above or below it."];
    case "winter":
      return [
        `Heavy-snow days, ${t("heavy_snow_day")}, are barely registered by modeled data, so they are reported but not scored.`,
        "Ice storms come from FEMA only — observed weather has no ice signal.",
        "Local adaptation is not modeled: the same snow disrupts southern cities more than northern ones.",
      ];
    case "flood":
      return [
        `Heavy-rain days, ${t("heavy_rain_day")}, are not the same as flooding. FEMA's inland flood frequency counts flood warnings anywhere in the county, so it is divided by the county's area (never less than a typical county's), which keeps very large counties from looking overstated. Large counties that are urban throughout can be understated instead.`,
        "In very large counties (e.g. Phoenix, Las Vegas, Los Angeles) FEMA's flood frequency is likely overstated, and for many big metros it is at the top of the scale.",
      ];
    case "severeStorms":
      return [
        "Severe storms (tornado + hail) come from FEMA only — five years of daily weather cannot measure them.",
        "Tornado frequency is scored per county area, because FEMA spreads tornado frequency by area.",
      ];
    case "wind":
      return [
        `Warning-level gusts, ${t("gust_warning_day")}, are undercounted by modeled data, so wind is scored on advisory-level gust days, ${t("gust_advisory_day")}.`,
      ];
    case "heat":
      return [
        `Observed heat uses one national threshold, ${t("extreme_heat_day")}; FEMA heat waves follow local heat-alert criteria, so the two can differ.`,
      ];
  }
}

/**
 * Standing caveats for one weather-stat metric.
 * @param metricId - the metric.
 * @param units - which unit system leads in the text.
 * @returns plain-language caveats (always includes the reanalysis caveat).
 */
export function metricCaveats(metricId: DayMetricId, units: UnitSystem): string[] {
  const caveats = [WEATHER_DATA_CAVEAT];
  const metric: DayMetric = DAY_METRICS[metricId];
  if (!metric.scored && metric.notScoredBecause) {
    caveats.push(`The ${metric.label} count, ${formatDual(metric.threshold, units)}, is reported only: ${metric.notScoredBecause}.`);
  }
  return caveats;
}
