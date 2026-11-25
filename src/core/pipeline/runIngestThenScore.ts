/**
 * @module core/pipeline/runIngestThenScore
 *
 * The nightly pipeline in one place (D54): fetch new data, then re-score every
 * hub under the SAME run id. Used by `npm run ingest` and the cron route.
 * It refuses to start while another run is in progress (see pipelineGuard.ts).
 */
import { formatBoundaryMessage, describeUnknownError } from "../errors/boundaryError";
import { runIngest, type IngestDeps, type IngestOptions, type IngestSummary } from "../ingest/runIngest";
import { runScoring, type ScoringDeps, type ScoringSummary } from "../scoring/runScoring";
import { pipelineGuardStatus, type PipelineGuardDeps, type PipelineGuardStatus } from "./pipelineGuard";

/** Result of the full pipeline: it either ran, or was skipped because another run is in progress. */
export type PipelineSummary =
  | { status: "ran"; ingest: IngestSummary; scoring: ScoringSummary }
  | { status: "skipped"; runningRunId: string | null; runningSince: string | null };

/** Everything the pipeline needs. */
export interface PipelineDeps {
  /** The ingest's I/O (its log and recordEvent are also used for the guard's own lines). */
  ingest: IngestDeps;
  /** The scoring's I/O. */
  scoring: ScoringDeps;
  /** Reads recent run events for the overlap guard. */
  guard: PipelineGuardDeps;
}

/**
 * Checks no other run is in progress. If the check itself fails (the events can't be read),
 * the run goes ahead and the problem is logged: a missed nightly run is worse than the rare
 * overlap, and a database that's down fails the run soon anyway.
 * @param deps - pipeline dependencies.
 * @returns the guard status.
 */
async function checkGuard(deps: PipelineDeps): Promise<PipelineGuardStatus> {
  try {
    return await pipelineGuardStatus(deps.guard);
  } catch (error) {
    deps.ingest.log(
      formatBoundaryMessage({
        name: "PipelineGuardError",
        message: `Could not check for a run in progress, so starting anyway: ${describeUnknownError(error)}`,
        functionName: "runIngestThenScore",
        boundary: "database",
      }),
    );
    return { allowed: true, runningRunId: null, runningSince: null };
  }
}

/**
 * Runs the ingest, then scores all hubs with the ingest's run id. Scoring runs
 * even if some hubs failed (or were skipped) — they are scored on the data they already have.
 * @param options - ingest options.
 * @param deps - ingest, scoring and guard dependencies.
 * @returns both summaries, or why the run was skipped.
 */
export async function runIngestThenScore(options: IngestOptions, deps: PipelineDeps): Promise<PipelineSummary> {
  const guard = await checkGuard(deps);
  if (!guard.allowed) {
    const message = `Another pipeline run (${guard.runningRunId}, started ${guard.runningSince}) is still in progress; this ${options.trigger} run was skipped`;
    deps.ingest.log(formatBoundaryMessage({ name: "PipelineAlreadyRunning", message, functionName: "runIngestThenScore", boundary: "database" }));
    await deps.ingest.recordEvent({
      eventType: "ingest.skipped_overlap",
      source: "ingest",
      level: "warn",
      message,
      payload: { trigger: options.trigger, runningRunId: guard.runningRunId, runningSince: guard.runningSince },
    });
    return { status: "skipped", runningRunId: guard.runningRunId, runningSince: guard.runningSince };
  }
  const ingest = await runIngest(options, deps.ingest);
  const scoring = await runScoring({ trigger: "ingest", runId: ingest.runId }, deps.scoring);
  return { status: "ran", ingest, scoring };
}
