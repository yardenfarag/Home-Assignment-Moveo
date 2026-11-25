/**
 * @module evals/lib/oracle
 *
 * The "answer key", computed at run time from the live data with the SAME core
 * functions the agent's tools use (E2) — so evals stay correct after every
 * nightly re-score, and nothing is hand-typed.
 */
import type { AgentContext } from "../../src/core/agent/context";
import type { CensusRegion } from "../../src/core/domain/hub";
import type { DayMetricId } from "../../src/core/scoring/dayMetrics";
import { rankHubs, type RankMetric } from "../../src/core/scoring/ranking";
import { HAZARDS, type Confidence, type RiskLevel } from "../../src/core/scoring/types";
import { computeWeatherStat, resolvePeriod } from "../../src/core/stats/weatherStats";

/** Expected values for the eval cases. */
export interface Oracle {
  /** Calendar year that "last year" means today (G11). */
  lastYear: number;
  /** id + display name of every scored hub (for text matching). */
  hubs: { id: string; name: string }[];
  /** Hub ids ranked by a metric (most exposed first), optionally within a region. */
  ranking: (metric: RankMetric, region?: CensusRegion) => string[];
  /** A hub's overall level, or a hazard's level. */
  level: (hubId: string, hazard?: (typeof HAZARDS)[number]) => RiskLevel;
  /** A hub's hazard score. */
  hazardScore: (hubId: string, hazard: (typeof HAZARDS)[number]) => number;
  /** A hub's hazard confidence. */
  hazardConfidence: (hubId: string, hazard: (typeof HAZARDS)[number]) => Confidence;
  /** % of days meeting a metric in a calendar year (null when no data). */
  yearPercent: (hubId: string, metric: DayMetricId, year: number) => Promise<number | null>;
}

/**
 * Builds the oracle from the agent's context (same data the agent sees).
 * @param ctx - loaded agent context.
 * @returns the oracle.
 */
export function buildOracle(ctx: AgentContext): Oracle {
  const snapshots = [...ctx.snapshotByHub.values()];
  const rows = snapshots.map((s) => ({
    hubId: s.hubId,
    region: ctx.hubById.get(s.hubId)!.region,
    scores: { overall: s.overallScore, ...Object.fromEntries(HAZARDS.map((h) => [h, s.hazards[h].score])) },
  }));
  return {
    lastYear: Number(ctx.today.slice(0, 4)) - 1,
    hubs: snapshots.map((s) => ({ id: s.hubId, name: ctx.hubById.get(s.hubId)!.name })),
    ranking: (metric, region) => rankHubs(rows, { metric, region, order: "most", limit: 36 }).map((r) => r.hubId),
    level: (hubId, hazard) => (hazard ? ctx.levelsByHub.get(hubId)!.hazards[hazard]! : ctx.levelsByHub.get(hubId)!.overall),
    hazardScore: (hubId, hazard) => ctx.snapshotByHub.get(hubId)!.hazards[hazard].score,
    hazardConfidence: (hubId, hazard) => ctx.snapshotByHub.get(hubId)!.hazards[hazard].confidence,
    yearPercent: async (hubId, metric, year) => {
      const period = resolvePeriod({ kind: "year", year }, ctx.weatherBounds);
      const days = await ctx.getWeatherDays(hubId, period.start, period.end);
      return computeWeatherStat(days, metric, period).percentOfDays;
    },
  };
}
