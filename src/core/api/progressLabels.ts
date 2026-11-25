/**
 * @module core/api/progressLabels
 *
 * Friendly progress lines shown while the agent works (UX-first), e.g.
 * "Breaking down Dallas's risk score…". All progress copy lives here.
 */
import { DAY_METRICS, type DayMetricId } from "../scoring/dayMetrics";
import type { RankMetric } from "../scoring/ranking";

/** Human names for hazards and the overall score, as used in progress lines. */
const METRIC_NAMES: Record<RankMetric, string> = {
  overall: "overall weather risk",
  hurricane: "hurricane exposure",
  winter: "winter exposure",
  flood: "flood exposure",
  severeStorms: "severe-storm exposure",
  wind: "wind exposure",
  heat: "heat exposure",
};

/**
 * Fallback display name from a hub id, for when the hub list isn't at hand:
 * "kansas-city" → "Kansas City", "st-louis" → "St. Louis". The tools pass the real names instead.
 * @param hubId - hub id (anything else gives "the hub").
 * @returns the display name.
 */
export function hubName(hubId: unknown): string {
  if (typeof hubId !== "string") return "the hub";
  return hubId
    .split("-")
    .map((word) => (word === "st" ? "St." : word[0]?.toUpperCase() + word.slice(1)))
    .join(" ");
}

/**
 * Joins names the way a sentence would.
 * @param names - the names.
 * @returns "A", "A and B", "A, B and C".
 */
function listNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * Builds the progress line for a tool call.
 * @param tool - tool name.
 * @param input - the tool's input (as the model sent it).
 * @param nameOf - hub id → display name (the tools pass the real hub names).
 * @returns a short, friendly line ending in "…".
 */
export function progressLabel(tool: string, input: unknown, nameOf: (hubId: string) => string = hubName): string {
  const i = (input ?? {}) as Record<string, unknown>;
  /** A hub's display name, or "the hub" when the input has no usable id. */
  const hub = (id: unknown) => (typeof id === "string" ? nameOf(id) : "the hub");
  switch (tool) {
    case "rank_hubs": {
      const what = METRIC_NAMES[i.metric as RankMetric] ?? "weather risk";
      return `Ranking hubs by ${what}${typeof i.region === "string" ? ` in the ${i.region}` : ""}…`;
    }
    case "compare_hubs":
      return `Comparing ${listNames(Array.isArray(i.hubIds) ? i.hubIds.map(hub) : [])}…`;
    case "explain_hub_score":
      return `Breaking down ${hub(i.hubId)}'s risk score…`;
    case "get_weather_stat": {
      const metric = DAY_METRICS[i.metric as DayMetricId];
      return `Counting ${metric ? `${metric.label}s` : "weather days"} in ${hub(i.hubId)}…`;
    }
    default:
      return "Checking the data…";
  }
}
