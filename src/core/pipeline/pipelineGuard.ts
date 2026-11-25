/**
 * @module core/pipeline/pipelineGuard
 *
 * Never two pipeline runs at once (cron + a manual `npm run ingest`, or a duplicate cron
 * delivery): two runs would raise every score-change alert twice and push Open-Meteo past
 * its per-minute limit. A run is "in progress" from its `ingest.started` event until the
 * `scoring.finished` event with the same correlation id (the pipeline scores under the ingest's
 * run id, D54). A start older than PIPELINE_TIMING.lockMinutes is treated as abandoned (the run
 * crashed or was killed), so a dead run never blocks the job for long.
 * Counted from events (no lock table), like the eval gate (core/api/evalGate.ts).
 *
 * Limitation: this is a check-then-run guard. Two runs started in the same second can both pass.
 * That needs a real lock; the cheap guard covers the realistic cases (a retry minutes later,
 * a manual run while the cron is busy).
 */
import { PIPELINE_TIMING } from "../config/timeouts";
import type { StoredEvent } from "../db/eventsRepository";

/** Event that marks the start of a run. */
export const PIPELINE_STARTED_EVENT = "ingest.started";

/** Event that marks the end of a run (scoring is the pipeline's last step). */
export const PIPELINE_FINISHED_EVENT = "scoring.finished";

/** Whether a new run may start. */
export interface PipelineGuardStatus {
  /** True when no other run is in progress. */
  allowed: boolean;
  /** The run still in progress, when one is. */
  runningRunId: string | null;
  /** When that run started (ISO). */
  runningSince: string | null;
}

/**
 * Decides from the recent starts and finishes.
 * @param starts - `ingest.started` events of the last lockMinutes, any order.
 * @param finishes - `scoring.finished` events of the same period.
 * @param now - the current time.
 * @returns the status.
 */
export function decidePipelineGuard(starts: readonly StoredEvent[], finishes: readonly StoredEvent[], now: Date): PipelineGuardStatus {
  const finished = new Set(finishes.map((f) => f.correlationId));
  const lockMs = PIPELINE_TIMING.lockMinutes * 60_000;
  const running = starts
    .filter((s) => s.correlationId !== null && !finished.has(s.correlationId) && now.getTime() - new Date(s.createdAt).getTime() < lockMs)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return running
    ? { allowed: false, runningRunId: running.correlationId, runningSince: running.createdAt }
    : { allowed: true, runningRunId: null, runningSince: null };
}

/** What the guard reads (injectable for tests). */
export interface PipelineGuardDeps {
  /** Lists recent events of one type, newest first. */
  listEvents: (query: { eventType: string; since: string; limit: number }) => Promise<StoredEvent[]>;
  /** The current time. */
  now: () => Date;
}

/**
 * Reads the recent starts and finishes, then decides.
 * @param deps - event reader and clock.
 * @returns the status.
 * @throws BoundaryError (database) when the events can't be read.
 */
export async function pipelineGuardStatus(deps: PipelineGuardDeps): Promise<PipelineGuardStatus> {
  const now = deps.now();
  const since = new Date(now.getTime() - PIPELINE_TIMING.lockMinutes * 60_000).toISOString();
  const [starts, finishes] = await Promise.all([
    deps.listEvents({ eventType: PIPELINE_STARTED_EVENT, since, limit: 20 }),
    deps.listEvents({ eventType: PIPELINE_FINISHED_EVENT, since, limit: 20 }),
  ]);
  return decidePipelineGuard(starts, finishes, now);
}
