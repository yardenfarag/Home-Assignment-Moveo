/**
 * @module core/agent/tools/explainHubScore
 *
 * `explain_hub_score` — "Why is the Dallas hub's weather disruption risk high?"
 * Returns the full, code-built breakdown, including the formula WITH its numbers,
 * so the model can explain without computing anything.
 */
import { tool } from "ai";
import { z } from "zod";
import type { StoredSnapshot } from "../../db/scoresRepository";
import { GENERAL_CAVEATS, hazardCaveats } from "../../scoring/caveats";
import { HAZARD_WEIGHTS, OVERALL_MIX } from "../../scoring/config";
import { riskLevelFor } from "../../scoring/overall";
import { competitionRanks } from "../../scoring/ranking";
import { HAZARDS } from "../../scoring/types";
import type { AgentContext } from "../context";
import { hubLabel, round1, runTool, type HubIdSchema, type ToolRuntime } from "./shared";

/**
 * Builds the explain_hub_score tool for one request.
 * @param ctx - agent context.
 * @param runtime - ledger and callbacks.
 * @param hubIdSchema - Zod enum of the active hub ids (G12).
 * @returns the AI SDK tool.
 */
export function buildExplainHubScoreTool(ctx: AgentContext, runtime: ToolRuntime, hubIdSchema: HubIdSchema) {
  return tool({
    description:
      "Full breakdown of ONE hub's risk score: every hazard with its inputs, weights, the overall formula with its numbers, " +
      "level, rank and confidence reasons. Use for 'why is X risky?' and BEFORE agreeing with any claim about a hub's level.",
    inputSchema: z.object({ hubId: hubIdSchema }),
    execute: (input, { toolCallId }) =>
      runTool("explain_hub_score", input, runtime, () => explainHubScoreOutput(ctx, input as { hubId: string }), toolCallId),
  });
}

/**
 * Builds the explain_hub_score result (pure; exported so the UI can import its type).
 * @param ctx - agent context.
 * @param input - validated tool input.
 * @returns the tool result.
 */
export function explainHubScoreOutput(ctx: AgentContext, input: { hubId: string }) {
  const snapshot = ctx.snapshotByHub.get(input.hubId);
  if (!snapshot) throw new Error(`No score available for hub "${input.hubId}".`);
  const hub = ctx.hubById.get(input.hubId)!;
  const all = [...ctx.snapshotByHub.values()];
  /** This hub's rank among all hubs on some score (ties share a rank). */
  const rankOf = (score: (s: StoredSnapshot) => number) =>
    competitionRanks(all.map((s) => ({ id: s.hubId, score: score(s) }))).get(input.hubId);
  const worst = snapshot.hazards[snapshot.topHazard].score;

  return {
    hubId: hub.id,
    hub: hubLabel(hub),
    county: hub.countyName ? `${hub.countyName} County (FIPS ${hub.countyFips})` : null,
    overallScore: snapshot.overallScore,
    // The level cut-offs and the formula's rule are in the system prompt (built from the same
    // config), so they aren't repeated here; `calculation` carries this hub's numbers.
    level: snapshot.riskLevel,
    rankOverall: rankOf((s) => s.overallScore),
    totalHubs: all.length,
    topHazard: snapshot.topHazard,
    formula: {
      weightedAverage: snapshot.weightedAverage,
      worstHazardScore: worst,
      calculation: `${OVERALL_MIX.weightedAverage} × ${snapshot.weightedAverage} + ${OVERALL_MIX.worstHazard} × ${worst} = ${snapshot.overallScore}`,
      /** Points each hazard adds to the overall score (0.6 × weight × score), for the score-breakdown visual (U3b). */
      contributions: HAZARDS.map((h) => ({
        hazard: h,
        points: round1(OVERALL_MIX.weightedAverage * HAZARD_WEIGHTS[h] * snapshot.hazards[h].score),
      })),
      /** Points added by the worst-hazard term (0.4 × worst hazard score). */
      worstHazardBoost: round1(OVERALL_MIX.worstHazard * worst),
    },
    hazards: HAZARDS.map((h) => {
      const hz = snapshot.hazards[h];
      return {
        hazard: h,
        weight: HAZARD_WEIGHTS[h],
        score: hz.score,
        level: riskLevelFor(hz.score),
        rankAmongAll: rankOf((s) => s.hazards[h].score),
        observedScore: hz.observedScore,
        femaScore: hz.femaScore,
        confidence: hz.confidence,
        confidenceReason: hz.confidenceReason,
        inputs: hz.inputs.map((i) => ({
          signal: i.signal,
          /** "observed" (weather, Open-Meteo) or "fema" (FEMA National Risk Index), as the system prompt names them. */
          source: i.source,
          valuePerYear: i.value === null ? null : Math.round(i.value * 100) / 100,
          unit: i.unit,
          valueThatScores100: i.anchor100,
          score: i.score === null ? null : round1(i.score),
        })),
      };
    }),
    observedWindow: snapshot.window,
    reportedOnlyStats: {
      heavySnowDaysPerYear: snapshot.observedPerYear?.heavySnowDays ?? null,
      warningGustDaysPerYear: snapshot.observedPerYear?.gustWarningDays ?? null,
      note: "Reported for context only; modeled data undercounts these, so they are not scored.",
    },
    scoringVersion: snapshot.scoringVersion,
    hubIds: [hub.id],
    confidence: snapshot.confidence,
    caveats: [...GENERAL_CAVEATS, ...HAZARDS.flatMap((h) => hazardCaveats(h, ctx.units))],
  };
}

/** Result of the explain_hub_score tool. */
export type ExplainHubScoreOutput = ReturnType<typeof explainHubScoreOutput>;

