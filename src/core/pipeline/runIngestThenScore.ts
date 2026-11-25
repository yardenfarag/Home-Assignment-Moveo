/**
 * @module core/pipeline/runIngestThenScore
 *
 * The nightly pipeline in one place (D54): fetch new data, then re-score every
 * hub under the SAME run id. Used by `npm run ingest` and (Step 5) the cron route.
 */
import { runIngest, type IngestDeps, type IngestOptions, type IngestSummary } from "../ingest/runIngest";
import { runScoring, type ScoringDeps, type ScoringSummary } from "../scoring/runScoring";

/** Result of the full pipeline. */
export interface PipelineSummary {
  ingest: IngestSummary;
  scoring: ScoringSummary;
}

/**
 * Runs the ingest, then scores all hubs with the ingest's run id. Scoring runs
 * even if some hubs failed to ingest — they are scored on the data they already have.
 * @param options - ingest options.
 * @param deps - ingest and scoring dependencies.
 * @returns both summaries.
 */
export async function runIngestThenScore(
  options: IngestOptions,
  deps: { ingest: IngestDeps; scoring: ScoringDeps },
): Promise<PipelineSummary> {
  const ingest = await runIngest(options, deps.ingest);
  const scoring = await runScoring({ trigger: "ingest", runId: ingest.runId }, deps.scoring);
  return { ingest, scoring };
}
