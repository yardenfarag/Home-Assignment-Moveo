/**
 * @module core/scoring/confidence
 *
 * Rule-based confidence (D51), computed in code — never by the LLM.
 * Trust depends on whether data is complete and whether sources AGREE,
 * not on how many sources there are.
 */
import { CONFIDENCE_RULES } from "./config";
import { CONFIDENCE_LEVELS, type Confidence } from "./types";

/** A confidence level plus a plain-language reason the agent can quote. */
export interface ConfidenceResult {
  confidence: Confidence;
  reason: string;
}

/**
 * Confidence for a hazard scored from observed weather AND FEMA.
 *
 * The "sources disagree" check compares LIKE WITH LIKE (D56): `comparableFemaScore`
 * is the FEMA score built only from signals observed weather can also see
 * (e.g. winter without ice storms). Pass `"not-comparable"` when the halves
 * measure different things (flood: heavy rain ≠ flood warnings) to skip the check.
 * @param input - the two halves (null = missing), the comparable FEMA score, and observed coverage (0..1).
 * @returns level and reason.
 */
export function hybridConfidence(input: {
  observedScore: number | null;
  femaScore: number | null;
  /** FEMA score for the cross-check; defaults to `femaScore`. */
  comparableFemaScore?: number | null | "not-comparable";
  coverage: number;
}): ConfidenceResult {
  const { observedScore, femaScore, coverage } = input;
  const comparable = input.comparableFemaScore === undefined ? femaScore : input.comparableFemaScore;
  const percentMissing = Math.round((1 - coverage) * 100);

  if (observedScore === null || femaScore === null) {
    const missing = observedScore === null ? "observed weather" : "FEMA";
    return { confidence: "low", reason: `Only one of two sources is available (${missing} data is missing).` };
  }
  if (coverage < CONFIDENCE_RULES.minimumCoverage) {
    return { confidence: "low", reason: `${percentMissing}% of days in the window have no weather data.` };
  }
  if (coverage < CONFIDENCE_RULES.completeCoverage) {
    return { confidence: "medium", reason: `${percentMissing}% of days in the window have no weather data.` };
  }
  if (comparable === "not-comparable") {
    return {
      confidence: "high",
      reason:
        "Complete data. The two sources measure different things (heavy-rain days vs. county-wide flood warnings), so they are combined but not cross-checked.",
    };
  }
  if (comparable !== null) {
    const gap = Math.abs(observedScore - comparable);
    if (gap > CONFIDENCE_RULES.disagreementPoints) {
      return {
        confidence: "medium",
        reason: `The two sources disagree: observed weather scores ${Math.round(observedScore)}, FEMA's long-term county record scores ${Math.round(comparable)} on the same phenomenon.`,
      };
    }
  }
  return { confidence: "high", reason: "Complete data, and observed weather and FEMA's record tell the same story." };
}

/**
 * Confidence for a hazard scored from FEMA only (hurricane, severe storms):
 * FEMA's long historical record is the right source for rare events.
 * @param femaScore - the FEMA score, or null when the record is missing.
 * @returns level and reason.
 */
export function femaOnlyConfidence(femaScore: number | null): ConfidenceResult {
  if (femaScore === null) return { confidence: "low", reason: "No FEMA record is available for this hub's county." };
  return { confidence: "high", reason: "Based on FEMA's long-term county frequency record (rare events need decades of data)." };
}

/**
 * The weakest of several confidence levels.
 * @param levels - at least one level.
 * @returns the lowest one.
 * @throws Error on an empty list.
 */
export function weakestConfidence(levels: Confidence[]): Confidence {
  if (levels.length === 0) throw new Error("weakestConfidence needs at least one level");
  return levels.reduce((weakest, level) =>
    CONFIDENCE_LEVELS.indexOf(level) > CONFIDENCE_LEVELS.indexOf(weakest) ? level : weakest,
  );
}
