/**
 * @module core/agent/tools/getWeatherStat
 *
 * `get_weather_stat` — "What percentage of days in Denver last year had snowfall?"
 * Counts hazard days in a period from the stored daily weather (computed in code).
 */
import { tool } from "ai";
import { z } from "zod";
import { metricCaveats } from "../../scoring/caveats";
import { DAY_METRIC_IDS, DAY_METRICS, type DayMetricId } from "../../scoring/dayMetrics";
import { coverageConfidence } from "../../scoring/confidence";
import { computeMonthlyCounts, computeWeatherStat, resolvePeriod, type PeriodRequest } from "../../stats/weatherStats";
import { formatDual } from "../../utils/units";
import type { AgentContext } from "../context";
import { hubLabel, runTool, type HubIdSchema, type ToolRuntime } from "./shared";

/**
 * Builds the get_weather_stat tool for one request.
 * @param ctx - agent context.
 * @param runtime - ledger and callbacks.
 * @param hubIdSchema - Zod enum of the active hub ids (G12).
 * @returns the AI SDK tool.
 */
export function buildGetWeatherStatTool(ctx: AgentContext, runtime: ToolRuntime, hubIdSchema: HubIdSchema) {
  const metricList = DAY_METRIC_IDS.map((id) => `${id} (${DAY_METRICS[id].threshold.us})`).join(", ");
  return tool({
    description:
      "Count hazard days for one hub in a period and the % of days that met the threshold. " +
      `Metrics: ${metricList}. Period: a calendar year (optionally one month), a date range, or the last 12 months.`,
    inputSchema: z.object({
      hubId: hubIdSchema,
      metric: z.enum(DAY_METRIC_IDS),
      periodKind: z.enum(["year", "range", "last12Months"]),
      year: z.number().int().nullable().describe("For periodKind 'year'."),
      month: z.number().int().min(1).max(12).nullable().describe("Optional month (1-12) within the year."),
      startDate: z.iso.date().nullable().describe("YYYY-MM-DD (a real calendar date), for periodKind 'range'."),
      endDate: z.iso.date().nullable().describe("YYYY-MM-DD (a real calendar date), for periodKind 'range'."),
    }),
    execute: (input, { toolCallId }) =>
      runTool("get_weather_stat", input, runtime, () => weatherStatOutput(ctx, input as Parameters<typeof weatherStatOutput>[1]), toolCallId),
  });
}

/**
 * Builds the get_weather_stat result (reads weather rows; exported so the UI can import its type).
 * @param ctx - agent context.
 * @param input - validated tool input.
 * @returns the tool result.
 */
export async function weatherStatOutput(ctx: AgentContext, input: { hubId: string; metric: DayMetricId; periodKind: "year" | "range" | "last12Months"; year: number | null; month: number | null; startDate: string | null; endDate: string | null }) {
  let request: PeriodRequest;
  if (input.periodKind === "year") {
    if (input.year === null) throw new Error("periodKind 'year' needs a year.");
    request = { kind: "year", year: input.year, month: input.month ?? undefined };
  } else if (input.periodKind === "range") {
    if (!input.startDate || !input.endDate) throw new Error("periodKind 'range' needs startDate and endDate.");
    request = { kind: "range", startDate: input.startDate, endDate: input.endDate };
  } else {
    request = { kind: "last12Months" };
  }
  const period = resolvePeriod(request, ctx.weatherBounds);
  const days = await ctx.getWeatherDays(input.hubId, period.start, period.end);
  const stat = computeWeatherStat(days, input.metric, period);
  const metric = DAY_METRICS[input.metric];
  const confidence = coverageConfidence(stat.coverage); // G6: from data coverage, with a reason to quote
  return {
    hubId: input.hubId,
    hub: hubLabel(ctx.hubById.get(input.hubId)!),
    metric: input.metric,
    metricLabel: metric.label,
    threshold: formatDual(metric.threshold, ctx.units),
    /** Both spellings, so the UI's unit switch can flip instantly (U4). */
    thresholdBySystem: metric.threshold,
    usedInRiskScore: metric.scored,
    period,
    ...stat,
    /** Hazard days per calendar month in the period (seasonality strip, U3b). */
    byMonth: computeMonthlyCounts(days, input.metric, period),
    hubIds: [input.hubId],
    confidence: confidence.confidence,
    confidenceReason: confidence.reason,
    caveats: [...metricCaveats(input.metric, ctx.units), ...period.notes],
  };
}

/** Result of the get_weather_stat tool. */
export type WeatherStatOutput = Awaited<ReturnType<typeof weatherStatOutput>>;

