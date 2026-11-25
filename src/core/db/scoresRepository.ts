/**
 * @module core/db/scoresRepository
 *
 * Writes score snapshots (one row per hub per run) and reads the latest run back,
 * validated with the same Zod schemas the scoring engine defines. Ranks are not
 * stored — they're derived when read (D54, see scoring/ranking.ts).
 */
import { z } from "zod";
import { SCORING_VERSION } from "../scoring/config";
import { BoundaryError } from "../errors/boundaryError";
import type { DateWindow, PerYearRates, WeatherCoverage } from "../scoring/observedSignals";
import { CONFIDENCE_LEVELS, HAZARDS, RISK_LEVELS, hazardScoresSchema, type HubScore } from "../scoring/types";
import type { Json } from "./database.types";
import { getDb, type Db } from "./client";

/** Everything stored for one hub in one run. */
export interface SnapshotToSave {
  hubId: string;
  runId: string;
  window: DateWindow;
  score: HubScore;
  /** Observed per-year rates, including the stats-only ones (heavy snow, warning gusts). */
  observedPerYear: PerYearRates | null;
  coverage: WeatherCoverage | null;
}

/**
 * Inserts all snapshots of a run in ONE write (fewer moving parts than per-hub writes).
 * @param snapshots - one per hub.
 * @param db - database client (injectable).
 * @returns how many rows were written.
 * @throws BoundaryError (database) when the insert fails.
 */
export async function saveScoreSnapshots(snapshots: SnapshotToSave[], db: Db = getDb()): Promise<number> {
  if (snapshots.length === 0) return 0;
  const rows = snapshots.map((s) => ({
    hub_id: s.hubId,
    run_id: s.runId,
    scoring_version: s.score.scoringVersion,
    window_start: s.window.start,
    window_end: s.window.end,
    overall_score: s.score.overallScore,
    risk_level: s.score.riskLevel,
    top_hazard: s.score.topHazard,
    confidence: s.score.confidence,
    hazard_scores: {
      weightedAverage: s.score.weightedAverage,
      hazards: s.score.hazards,
      observedPerYear: s.observedPerYear,
      coverage: s.coverage,
    } as unknown as Json,
  }));
  const { error } = await db.from("score_snapshots").insert(rows);
  if (error) {
    throw new BoundaryError({
      name: "SupabaseInsertError",
      message: `Could not store ${rows.length} score snapshots: ${error.message}`,
      functionName: "saveScoreSnapshots",
      boundary: "database",
      cause: error,
    });
  }
  return rows.length;
}

/** Shape of the `hazard_scores` jsonb column (validated on read). */
const storedBreakdownSchema = z.object({
  weightedAverage: z.number(),
  hazards: hazardScoresSchema,
  observedPerYear: z.record(z.string(), z.number().nullable()).nullable(),
  coverage: z.record(z.string(), z.number()).nullable(),
});

/** One hub's latest stored score, validated. */
export interface StoredSnapshot extends HubScore {
  hubId: string;
  runId: string;
  createdAt: string;
  window: DateWindow;
  observedPerYear: PerYearRates | null;
  coverage: WeatherCoverage | null;
}

const snapshotRowSchema = z.object({
  hub_id: z.string(),
  run_id: z.string(),
  created_at: z.string(),
  scoring_version: z.string(),
  window_start: z.string(),
  window_end: z.string(),
  overall_score: z.coerce.number(),
  risk_level: z.enum(RISK_LEVELS),
  top_hazard: z.enum(HAZARDS),
  confidence: z.enum(CONFIDENCE_LEVELS),
  hazard_scores: storedBreakdownSchema,
});

/**
 * Reads the most recent scoring run for the CURRENT scoring version.
 * @param db - database client (injectable).
 * @returns the run's snapshots (one per hub), or null when nothing has been scored yet.
 * @throws BoundaryError (database) when a query fails or a stored row is invalid.
 */
export async function getLatestSnapshots(db: Db = getDb()): Promise<StoredSnapshot[] | null> {
  const latest = await db
    .from("score_snapshots")
    .select("run_id")
    .eq("scoring_version", SCORING_VERSION)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error) {
    throw new BoundaryError({
      name: "SupabaseQueryError",
      message: `Could not find the latest scoring run: ${latest.error.message}`,
      functionName: "getLatestSnapshots",
      boundary: "database",
      cause: latest.error,
    });
  }
  if (!latest.data) return null;

  const { data, error } = await db.from("score_snapshots").select("*").eq("run_id", latest.data.run_id);
  if (error) {
    throw new BoundaryError({
      name: "SupabaseQueryError",
      message: `Could not read snapshots of run ${latest.data.run_id}: ${error.message}`,
      functionName: "getLatestSnapshots",
      boundary: "database",
      cause: error,
    });
  }
  const parsed = z.array(snapshotRowSchema).safeParse(data);
  if (!parsed.success) {
    throw new BoundaryError({
      name: "SnapshotValidationError",
      message: `Stored snapshots of run ${latest.data.run_id} do not match the scoring schema: ${parsed.error.issues[0]?.message}`,
      functionName: "getLatestSnapshots",
      boundary: "database",
      cause: parsed.error,
    });
  }
  return parsed.data.map((row) => ({
    hubId: row.hub_id,
    runId: row.run_id,
    createdAt: row.created_at,
    scoringVersion: row.scoring_version,
    window: { start: row.window_start, end: row.window_end },
    overallScore: row.overall_score,
    weightedAverage: row.hazard_scores.weightedAverage,
    riskLevel: row.risk_level,
    topHazard: row.top_hazard,
    confidence: row.confidence,
    hazards: row.hazard_scores.hazards,
    observedPerYear: row.hazard_scores.observedPerYear as PerYearRates | null,
    coverage: row.hazard_scores.coverage as WeatherCoverage | null,
  }));
}
