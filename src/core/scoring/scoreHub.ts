/**
 * @module core/scoring/scoreHub
 *
 * The one entry point for scoring a hub: hazard scores → overall → level →
 * confidence. Pure and deterministic: same inputs, same output, always.
 */
import { SCORING_VERSION } from "./config";
import { weakestConfidence } from "./confidence";
import { computeHazardScores } from "./hazards";
import type { ObservedSignals } from "./observedSignals";
import { computeOverall, riskLevelFor } from "./overall";
import { round } from "../utils/stats";
import { HAZARDS, type FemaSignals, type Hazard, type HubScore } from "./types";

/**
 * Rounds to 1 decimal (published precision).
 * @param value - the number.
 * @returns the rounded number.
 */
const round1 = (value: number) => round(value, 1);

/**
 * Scores one hub.
 * @param observed - observed-weather signals for the window (null if none).
 * @param fema - FEMA county signals (null if no record).
 * @returns the full, explainable score.
 */
export function scoreHub(observed: ObservedSignals | null, fema: FemaSignals | null): HubScore {
  const hazards = computeHazardScores(observed, fema);
  // The overall is computed from the published (rounded) hazard scores, so the numbers the agent shows add up.
  const scores = Object.fromEntries(HAZARDS.map((h) => [h, hazards[h].score])) as Record<Hazard, number>;
  const overall = computeOverall(scores);
  const overallScore = round1(overall.overallScore);
  return {
    scoringVersion: SCORING_VERSION,
    overallScore,
    weightedAverage: round1(overall.weightedAverage),
    riskLevel: riskLevelFor(overallScore),
    topHazard: overall.topHazard,
    confidence: weakestConfidence(HAZARDS.map((h) => hazards[h].confidence)),
    hazards,
  };
}
