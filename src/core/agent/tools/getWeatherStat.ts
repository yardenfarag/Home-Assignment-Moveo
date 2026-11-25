/**
 * @module core/agent/tools/getWeatherStat
 *
 * `get_weather_stat` — "What percentage of days in Denver last year had snowfall?"
 * Counts hazard days in a period from the stored daily weather (computed in code).
 */
import { tool } from "ai";
import { z } from "zod";
import { metricCaveats } from "../../scoring/caveats";
import { CONFIDENCE_RULES } from "../../scoring/config";
import { DAY_METRIC_IDS, DAY_METRICS } from "../../scoring/dayMetrics";
import type { Confidence } from "../../scoring/types";
import { computeWeatherStat, resolvePeriod, type PeriodRequest } from "../../stats/weatherStats";
import { formatDual } from "../../utils/units";
import type { AgentContext } from "../context";
import { hubLabel, runTool, type HubIdSchema, type ToolRuntime } from "./shared";

/** Confidence of a stat from its data coverage (G6). */
function coverageConfidence(coverage: number): Confidence {
  if (coverage >= CONFIDENCE_RULES.completeCoverage) return "high";
  if (coverage >= CONFIDENCE_RULES.minimumCoverage) return "medium";
  return "low";
}

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
      startDate: z.string().nullable().describe("YYYY-MM-DD, for periodKind 'range'."),
      endDate: z.string().nullable().describe("YYYY-MM-DD, for periodKind 'range'."),
    }),
    execute: (input) =>
      runTool("get_weather_stat", input, runtime, async () => {
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
        return {
          hubId: input.hubId,
          hub: hubLabel(ctx.hubById.get(input.hubId)!),
          metric: input.metric,
          metricLabel: metric.label,
          threshold: formatDual(metric.threshold, ctx.units),
          usedInRiskScore: metric.scored,
          period,
          ...stat,
          hubIds: [input.hubId],
          confidence: coverageConfidence(stat.coverage),
          caveats: [...metricCaveats(input.metric, ctx.units), ...period.notes],
        };
      }),
  });
}
