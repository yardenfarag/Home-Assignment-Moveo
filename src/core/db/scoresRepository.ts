/**
 * @module core/db/scoresRepository
 *
 * Writes score snapshots (one row per hub per run). Reading them — and
 * deriving ranks at read time (D54) — arrives with the agent tools in Step 4.
 */
import { BoundaryError } from "../errors/boundaryError";
import type { DateWindow, PerYearRates, WeatherCoverage } from "../scoring/observedSignals";
import type { HubScore } from "../scoring/types";
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
