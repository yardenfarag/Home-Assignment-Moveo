/**
 * @module core/db/scoresRepository
 *
 * Writes score snapshots (one row per hub per run) and reads each hub's latest one back,
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

/**
 * One hub's latest stored score, validated. Snapshots of different hubs can come from different
 * runs (a hub that failed in the newest run keeps its own last snapshot), so `createdAt` and
 * `window` are per hub: compare them to see how fresh each hub's score is.
 */
export interface StoredSnapshot extends HubScore {
  hubId: string;
  /** The scoring run that produced this snapshot. */
  runId: string;
  /** When this snapshot was saved (ISO). */
  createdAt: string;
  /** The weather days this score is built on; `window.end` = the hub's newest weather day then. */
  window: DateWindow;
  observedPerYear: PerYearRates | null;
  coverage: WeatherCoverage | null;
}

/** One `score_snapshots` row as read back (numeric columns may arrive as strings). */
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
 * Validates stored rows and converts them into snapshots.
 * @param rows - raw `score_snapshots` rows.
 * @param what - which rows, for the error message (e.g. "run 1234…").
 * @returns the snapshots.
 * @throws BoundaryError (database) `SnapshotValidationError` when a row doesn't match the scoring schema.
 */
function snapshotsFromRows(rows: unknown[], what: string): StoredSnapshot[] {
  const parsed = z.array(snapshotRowSchema).safeParse(rows);
  if (!parsed.success) {
    throw new BoundaryError({
      name: "SnapshotValidationError",
      message: `Stored snapshots of ${what} do not match the scoring schema: ${parsed.error.issues[0]?.message}`,
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

/** The reads behind {@link loadLatestSnapshots} (injectable, so the logic is tested without a database). */
export interface LatestSnapshotReader {
  /** The newest run of the current scoring version, or null when nothing is scored yet. */
  newestRunId: () => Promise<string | null>;
  /** Every row of one run. */
  runRows: (runId: string) => Promise<unknown[]>;
  /** The ids of the active hubs. */
  activeHubIds: () => Promise<string[]>;
  /** One hub's newest row of the current scoring version, or null when it has none. */
  latestRowForHub: (hubId: string) => Promise<unknown>;
}

/**
 * The latest snapshot PER HUB for the current scoring version: every row of the newest run,
 * plus, for each active hub missing from that run (it failed to score that night), its own
 * newest snapshot from an earlier run. So one hub failing never makes it vanish from the
 * widgets, the agent and the rankings, and its next alert still has a baseline. Stale hubs
 * show up through their older `createdAt` / `window.end`.
 * @param reader - the database reads.
 * @returns snapshots sorted by hub id, or null when nothing has been scored yet.
 * @throws BoundaryError (database) when a read fails or a stored row is invalid.
 */
export async function loadLatestSnapshots(reader: LatestSnapshotReader): Promise<StoredSnapshot[] | null> {
  const runId = await reader.newestRunId();
  if (!runId) return null;
  const [rows, activeIds] = await Promise.all([reader.runRows(runId), reader.activeHubIds()]);
  const newest = snapshotsFromRows(rows, `run ${runId}`);
  const scored = new Set(newest.map((s) => s.hubId));
  const missing = activeIds.filter((id) => !scored.has(id));
  const carried = (await Promise.all(missing.map((id) => reader.latestRowForHub(id)))).filter((row) => row !== null && row !== undefined);
  const older = snapshotsFromRows(carried, `earlier runs (${missing.join(", ")})`);
  return [...newest, ...older].sort((a, b) => a.hubId.localeCompare(b.hubId));
}

/**
 * Wraps a failed query in the database boundary error.
 * @param what - what was being read.
 * @param error - the Supabase error.
 * @returns the error to throw.
 */
function queryError(what: string, error: { message: string }): BoundaryError {
  return new BoundaryError({
    name: "SupabaseQueryError",
    message: `Could not read ${what}: ${error.message}`,
    functionName: "getLatestSnapshots",
    boundary: "database",
    cause: error,
  });
}

/** Rows asked for per page when reading one run (the server may cap it lower). */
const RUN_PAGE_SIZE = 1_000;

/**
 * The Supabase implementation of {@link LatestSnapshotReader}.
 * @param db - database client.
 * @returns the reader.
 */
export function dbLatestSnapshotReader(db: Db): LatestSnapshotReader {
  return {
    newestRunId: async () => {
      const { data, error } = await db
        .from("score_snapshots")
        .select("run_id")
        .eq("scoring_version", SCORING_VERSION)
        .order("created_at", { ascending: false })
        .order("run_id")
        .limit(1)
        .maybeSingle();
      if (error) throw queryError("the latest scoring run", error);
      return data?.run_id ?? null;
    },
    runRows: async (runId) => {
      // Paged and counted, so a server row cap can't silently drop hubs (lesson 8).
      const rows: unknown[] = [];
      for (;;) {
        const { data, error, count } = await db
          .from("score_snapshots")
          .select("*", { count: "exact" })
          .eq("run_id", runId)
          .order("hub_id")
          .range(rows.length, rows.length + RUN_PAGE_SIZE - 1);
        if (error) throw queryError(`snapshots of run ${runId}`, error);
        rows.push(...data);
        if (data.length === 0 || rows.length >= (count ?? 0)) return rows;
      }
    },
    activeHubIds: async () => {
      const { data, error } = await db.from("hubs").select("id").eq("is_active", true).order("id");
      if (error) throw queryError("the active hubs", error);
      return data.map((row) => row.id);
    },
    latestRowForHub: async (hubId) => {
      const { data, error } = await db
        .from("score_snapshots")
        .select("*")
        .eq("hub_id", hubId)
        .eq("scoring_version", SCORING_VERSION)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw queryError(`the latest snapshot of ${hubId}`, error);
      return data;
    },
  };
}

/**
 * Reads the latest snapshot per hub for the CURRENT scoring version (see {@link loadLatestSnapshots}).
 * @param db - database client (injectable).
 * @returns one snapshot per hub, sorted by hub id, or null when nothing has been scored yet.
 * @throws BoundaryError (database) when a query fails or a stored row is invalid.
 */
export async function getLatestSnapshots(db: Db = getDb()): Promise<StoredSnapshot[] | null> {
  return loadLatestSnapshots(dbLatestSnapshotReader(db));
}
