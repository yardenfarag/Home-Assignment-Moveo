/**
 * @module core/agent/tools/rankHubs
 *
 * `rank_hubs` — "Which Midwest hubs are most exposed to winter disruption?"
 * Ranks are derived from the latest snapshots when called (D54).
 */
import { tool } from "ai";
import { z } from "zod";
import { CENSUS_REGIONS, type CensusRegion } from "../../domain/hub";
import { GENERAL_CAVEATS, hazardCaveats } from "../../scoring/caveats";
import { weakestConfidence } from "../../scoring/confidence";
import { riskLevelFor } from "../../scoring/overall";
import { rankHubs, scoreSpread, type RankMetric } from "../../scoring/ranking";
import { HAZARDS } from "../../scoring/types";
import type { AgentContext } from "../context";
import { hubLabel, runTool, type ToolRuntime } from "./shared";

/**
 * Builds the rank_hubs tool for one request.
 * @param ctx - agent context.
 * @param runtime - ledger and callbacks.
 * @returns the AI SDK tool.
 */
export function buildRankHubsTool(ctx: AgentContext, runtime: ToolRuntime) {
  return tool({
    description:
      "Rank our hubs by overall weather risk or by one hazard, optionally within a US Census region. " +
      "Use for 'which hubs are most/least exposed to X'. Returns each hub's score (0-100), level, and its rank among ALL hubs.",
    inputSchema: z.object({
      metric: z.enum(["overall", ...HAZARDS]).describe("'overall' or a hazard: hurricane, winter, flood, severeStorms, wind, heat."),
      region: z.enum(CENSUS_REGIONS).nullable().describe("US Census region filter, or null for all hubs."),
      order: z.enum(["most", "least"]).describe("'most' = most exposed first."),
      limit: z.number().int().min(1).max(36).describe("How many hubs to return (default 5)."),
    }),
    execute: (input) =>
      runTool("rank_hubs", input, runtime, () => rankHubsOutput(ctx, input as Parameters<typeof rankHubsOutput>[1])),
  });
}

/**
 * Builds the rank_hubs result (pure; exported so the UI can import its type).
 * @param ctx - agent context.
 * @param input - validated tool input.
 * @returns the tool result.
 */
export function rankHubsOutput(ctx: AgentContext, input: { metric: RankMetric; region: CensusRegion | null; order: "most" | "least"; limit: number }) {
  const metric = input.metric as RankMetric;
  const rows = [...ctx.snapshotByHub.values()].map((s) => ({
    hubId: s.hubId,
    region: ctx.hubById.get(s.hubId)!.region,
    scores: { overall: s.overallScore, ...Object.fromEntries(HAZARDS.map((h) => [h, s.hazards[h].score])) },
  }));
  const ranked = rankHubs(rows, { metric, region: input.region ?? undefined, order: input.order, limit: input.limit });
  const results = ranked.map((r) => {
    const snapshot = ctx.snapshotByHub.get(r.hubId)!;
    const hazard = metric === "overall" ? null : snapshot.hazards[metric];
    return {
      hubId: r.hubId,
      hub: hubLabel(ctx.hubById.get(r.hubId)!),
      region: ctx.hubById.get(r.hubId)!.region,
      score: r.score,
      level: metric === "overall" ? snapshot.riskLevel : riskLevelFor(r.score),
      rankAmongAll: r.rankAmongAll,
      totalHubs: r.totalHubs,
      rankInSelection: r.rankInSelection,
      selectionSize: r.selectionSize,
      topHazard: snapshot.topHazard,
      confidence: hazard ? hazard.confidence : snapshot.confidence,
      confidenceReason: hazard ? hazard.confidenceReason : undefined,
    };
  });
  const any = ctx.snapshotByHub.values().next().value!;
  return {
    metric,
    region: input.region,
    order: input.order,
    scoringVersion: any.scoringVersion,
    scoredWindow: any.window,
    results,
    /** Points between the first and last hub listed — quote this instead of subtracting (E10). */
    spread: scoreSpread(results.map((r) => ({ hubId: r.hubId, score: r.score }))),
    hubIds: results.map((r) => r.hubId),
    confidence: results.length ? weakestConfidence(results.map((r) => r.confidence)) : null,
    caveats: [...GENERAL_CAVEATS, ...(metric === "overall" ? [] : hazardCaveats(metric, ctx.units))],
  };
}

/** Result of the rank_hubs tool. */
export type RankHubsOutput = ReturnType<typeof rankHubsOutput>;

