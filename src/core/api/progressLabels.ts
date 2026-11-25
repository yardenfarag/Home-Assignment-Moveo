/**
 * @module core/api/progressLabels
 *
 * Friendly progress lines shown while the agent works (UX-first), e.g.
 * "Breaking down Dallas's risk score…". All progress copy lives here.
 */
import { DAY_METRICS, type DayMetricId } from "../scoring/dayMetrics";

/** Human names for hazards and the overall score, as used in progress lines. */
const METRIC_NAMES: Record<string, string> = {
  overall: "overall weather risk",
  hurricane: "hurricane exposure",
  winter: "winter exposure",
  flood: "flood exposure",
  severeStorms: "severe-storm exposure",
  wind: "wind exposure",
  heat: "heat exposure",
};

/** "kansas-city" → "Kansas City". */
function hubName(hubId: unknown): string {
  if (typeof hubId !== "string") return "the hub";
  return hubId
    .split("-")
    .map((word) => (word === "st" ? "St." : word[0]?.toUpperCase() + word.slice(1)))
    .join(" ");
}

/** "A", "A and B", "A, B and C". */
function listNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * Builds the progress line for a tool call.
 * @param tool - tool name.
 * @param input - the tool's input (as the model sent it).
 * @returns a short, friendly line ending in "…".
 */
export function progressLabel(tool: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  switch (tool) {
    case "rank_hubs": {
      const what = METRIC_NAMES[String(i.metric)] ?? "weather risk";
      return `Ranking hubs by ${what}${typeof i.region === "string" ? ` in the ${i.region}` : ""}…`;
    }
    case "compare_hubs":
      return `Comparing ${listNames(Array.isArray(i.hubIds) ? i.hubIds.map(hubName) : [])}…`;
    case "explain_hub_score":
      return `Breaking down ${hubName(i.hubId)}'s risk score…`;
    case "get_weather_stat": {
      const metric = DAY_METRICS[i.metric as DayMetricId];
      return `Counting ${metric ? `${metric.label}s` : "weather days"} in ${hubName(i.hubId)}…`;
    }
    default:
      return "Checking the data…";
  }
}
