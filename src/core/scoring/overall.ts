/**
 * @module core/scoring/overall
 *
 * Combines the six hazard scores into one overall score (D19):
 *   overall = 60% × weighted average + 40% × worst hazard
 * so one severe hazard (e.g. Miami hurricanes) is never averaged away.
 */
import { HAZARD_WEIGHTS, OVERALL_MIX, RISK_LEVEL_CUTOFFS } from "./config";
import { HAZARDS, type Hazard, type RiskLevel } from "./types";

/** Overall result before rounding/assembly. */
export interface OverallResult {
  overallScore: number;
  weightedAverage: number;
  /** Highest-scoring hazard; ties go to the heavier-weighted hazard. */
  topHazard: Hazard;
}

/**
 * Computes the overall score from hazard scores.
 * @param scores - 0–100 score per hazard.
 * @returns overall score, weighted average and top hazard.
 */
export function computeOverall(scores: Record<Hazard, number>): OverallResult {
  const weightedAverage = HAZARDS.reduce((sum, hazard) => sum + HAZARD_WEIGHTS[hazard] * scores[hazard], 0);
  // HAZARDS is in weight order, so a strict ">" keeps the heavier hazard on ties.
  const topHazard = HAZARDS.reduce((top, hazard) => (scores[hazard] > scores[top] ? hazard : top), HAZARDS[0]);
  const overallScore = OVERALL_MIX.weightedAverage * weightedAverage + OVERALL_MIX.worstHazard * scores[topHazard];
  return { overallScore, weightedAverage, topHazard };
}

/**
 * Risk level for an overall score, using the score rounded to a whole number:
 * Low 0–33, Medium 34–66, High 67–100.
 * @param score - 0–100.
 * @returns the level.
 */
export function riskLevelFor(score: number): RiskLevel {
  const rounded = Math.round(score);
  if (rounded >= RISK_LEVEL_CUTOFFS.highFrom) return "high";
  if (rounded >= RISK_LEVEL_CUTOFFS.mediumFrom) return "medium";
  return "low";
}
