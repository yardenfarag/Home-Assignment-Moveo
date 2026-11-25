/**
 * @module core/agent/tools/compareHubs
 *
 * `compare_hubs` — "Compare Miami and Houston in terms of hurricane and flood exposure."
 */
import { tool } from "ai";
import { z } from "zod";
import { GENERAL_CAVEATS, hazardCaveats } from "../../scoring/caveats";
import { weakestConfidence } from "../../scoring/confidence";
import { riskLevelFor } from "../../scoring/overall";
import { competitionRanks, scoreSpread } from "../../scoring/ranking";
import { HAZARDS, type Hazard } from "../../scoring/types";
import type { AgentContext } from "../context";
import { compareCellKey } from "./compareCells";
import { hubLabel, runTool, type HubIdSchema, type ToolRuntime } from "./shared";

/**
 * Builds the compare_hubs tool for one request.
 * @param ctx - agent context.
 * @param runtime - ledger and callbacks.
 * @param hubIdSchema - Zod enum of the active hub ids (G12).
 * @returns the AI SDK tool.
 */
export function buildCompareHubsTool(ctx: AgentContext, runtime: ToolRuntime, hubIdSchema: HubIdSchema) {
  return tool({
    description:
      "Compare 2-5 hubs side by side: overall score, level, rank, and per-hazard scores with both halves " +
      "(observed weather vs FEMA) and confidence. Optionally restrict to some hazards.",
    inputSchema: z.object({
      hubIds: z
        .array(hubIdSchema)
        .min(2)
        .max(5)
        .refine((ids) => new Set(ids).size === ids.length, "List each hub once."),
      hazards: z.array(z.enum(HAZARDS)).nullable().describe("Hazards to include, or null for all six."),
    }),
    execute: (input, { toolCallId }) =>
      runTool("compare_hubs", input, runtime, () => compareHubsOutput(ctx, input as Parameters<typeof compareHubsOutput>[1]), toolCallId),
  });
}

/**
 * Builds the compare_hubs result (pure; exported so the UI can import its type).
 * @param ctx - agent context.
 * @param input - validated tool input.
 * @returns the tool result.
 */
export function compareHubsOutput(ctx: AgentContext, input: { hubIds: string[]; hazards: Hazard[] | null }) {
  const hazards: Hazard[] = input.hazards?.length ? input.hazards : [...HAZARDS];
  const all = [...ctx.snapshotByHub.values()];
  const overallRanks = competitionRanks(all.map((s) => ({ id: s.hubId, score: s.overallScore })));
  const hazardRanks = Object.fromEntries(
    hazards.map((h) => [h, competitionRanks(all.map((s) => ({ id: s.hubId, score: s.hazards[h].score })))]),
  ) as Record<Hazard, Map<string, number>>;

  // The same few reasons repeat across cells, so each reason text is listed once with the cells it applies to.
  const confidenceReasons: Record<string, string[]> = {};
  const hubs = input.hubIds.map((hubId) => {
    const snapshot = ctx.snapshotByHub.get(hubId);
    if (!snapshot) throw new Error(`No score available for hub "${hubId}".`);
    return {
      hubId,
      hub: hubLabel(ctx.hubById.get(hubId)!),
      overallScore: snapshot.overallScore,
      level: snapshot.riskLevel,
      rankOverall: overallRanks.get(hubId),
      topHazard: snapshot.topHazard,
      hazards: Object.fromEntries(
        hazards.map((h) => {
          const hz = snapshot.hazards[h];
          (confidenceReasons[hz.confidenceReason] ??= []).push(compareCellKey(hubId, h));
          return [
            h,
            {
              score: hz.score,
              level: riskLevelFor(hz.score),
              rankAmongAll: hazardRanks[h].get(hubId),
              observedScore: hz.observedScore,
              femaScore: hz.femaScore,
              confidence: hz.confidence,
            },
          ];
        }),
      ),
    };
  });
  /** Points between the highest and lowest of the compared hubs on some score. */
  const spreadOf = (pick: (hubId: string) => number) => scoreSpread(input.hubIds.map((hubId) => ({ hubId, score: pick(hubId) })));
  return {
    totalHubs: all.length,
    hubs,
    /** Reason text → the cells ("hubId/hazard") whose confidence it explains. */
    confidenceReasons,
    /** Gaps between the compared hubs, computed in code — quote these instead of subtracting (E10). */
    gaps: {
      overall: spreadOf((id) => ctx.snapshotByHub.get(id)!.overallScore),
      ...Object.fromEntries(hazards.map((h) => [h, spreadOf((id) => ctx.snapshotByHub.get(id)!.hazards[h].score)])),
    },
    hubIds: input.hubIds,
    confidence: weakestConfidence(
      input.hubIds.flatMap((id) => hazards.map((h) => ctx.snapshotByHub.get(id)!.hazards[h].confidence)),
    ),
    caveats: [...GENERAL_CAVEATS, ...hazards.flatMap((h) => hazardCaveats(h, ctx.units))],
  };
}

/** Result of the compare_hubs tool. */
export type CompareHubsOutput = ReturnType<typeof compareHubsOutput>;

