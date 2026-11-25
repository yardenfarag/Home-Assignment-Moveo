/**
 * @module core/scoring/types
 *
 * Shared vocabulary of the scoring engine. Lists that are mirrored by database
 * check constraints are kept in the same order as the SQL, and
 * `db/schemaDrift.test.ts` fails if they drift.
 */
import { z } from "zod";

/** The six hazards we score, in weight order (heaviest first). Mirrors `score_snapshots.top_hazard`. */
export const HAZARDS = ["hurricane", "winter", "flood", "severeStorms", "wind", "heat"] as const;

/** One of the six scored hazards. */
export type Hazard = (typeof HAZARDS)[number];

/** Overall risk levels. Mirrors `score_snapshots.risk_level`. */
export const RISK_LEVELS = ["low", "medium", "high"] as const;

/** Low / Medium / High risk. */
export type RiskLevel = (typeof RISK_LEVELS)[number];

/** Confidence levels. Mirrors `score_snapshots.confidence`. */
export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;

/** How much to trust a score (D51). */
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

/**
 * FEMA NRI inputs for one hub's county: annualized frequencies (events or
 * event-days per year). `null` = FEMA rates the hazard "not applicable" there,
 * which scores 0 (D18).
 */
export interface FemaSignals {
  /** County area, used to turn the tornado count into a density (D53). */
  countyAreaSqMi: number;
  hurricane: number | null;
  tornado: number | null;
  hail: number | null;
  inlandFlood: number | null;
  coastalFlood: number | null;
  iceStorm: number | null;
  winterWeather: number | null;
  coldWave: number | null;
  heatWave: number | null;
  strongWind: number | null;
}

/** Which data source a signal comes from. */
export const signalSourceSchema = z.enum(["observed", "fema"]);

/** Observed weather or FEMA. */
export type SignalSource = z.infer<typeof signalSourceSchema>;

/**
 * One input that went into a hazard score — kept so the agent can explain the number.
 * Defined as a Zod schema so stored snapshots are validated with the SAME definition (single source of truth).
 */
export const signalInputSchema = z.object({
  /** Machine name, e.g. `snowDays`, `tornadoPer1000SqMi`. */
  signal: z.string(),
  source: signalSourceSchema,
  /** Raw value (per year), or null when not available. */
  value: z.number().nullable(),
  /** Human unit, e.g. "days/yr", "events/yr". */
  unit: z.string(),
  /** The value that maps to 100. */
  anchor100: z.number(),
  /** 0–100 score of this input, or null when the value is missing. */
  score: z.number().nullable(),
});

/** One scored input. */
export type SignalInput = z.infer<typeof signalInputSchema>;

/** The score of one hazard, with everything needed to explain it. */
export const hazardScoreSchema = z.object({
  hazard: z.enum(HAZARDS),
  /** 0–100, 1 decimal. */
  score: z.number(),
  /** Observed-weather half (null when the hazard has none, or data is missing). */
  observedScore: z.number().nullable(),
  /** FEMA half (null when missing). */
  femaScore: z.number().nullable(),
  confidence: z.enum(CONFIDENCE_LEVELS),
  /** Plain-language reason for the confidence level. */
  confidenceReason: z.string(),
  inputs: z.array(signalInputSchema),
});

/** One hazard's score. */
export type HazardScore = z.infer<typeof hazardScoreSchema>;

/** Hazard → score, for all six hazards. */
export const hazardScoresSchema = z.object(
  Object.fromEntries(HAZARDS.map((h) => [h, hazardScoreSchema])) as Record<Hazard, typeof hazardScoreSchema>,
);

/** The full deterministic result for one hub. */
export interface HubScore {
  scoringVersion: string;
  /** 0–100, 1 decimal. */
  overallScore: number;
  /** Weighted average of hazard scores (before mixing in the worst hazard). */
  weightedAverage: number;
  riskLevel: RiskLevel;
  /** The hazard with the highest score. */
  topHazard: Hazard;
  /** Weakest confidence among the hazards. */
  confidence: Confidence;
  hazards: Record<Hazard, HazardScore>;
}
