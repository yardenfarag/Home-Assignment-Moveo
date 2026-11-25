/**
 * @module core/config/timeouts
 *
 * Every deadline for calls that leave our process, in one place.
 * Rule (CLAUDE.md): every external call has a timeout — no exceptions.
 */

/** Per-request timeout for external HTTP APIs (Open-Meteo, FEMA). */
export const EXTERNAL_HTTP_TIMEOUT_MS = 30_000;

/**
 * Waits before each retry of an external HTTP call (its length = number of retries).
 * Worst case for one call: 4 attempts × 30 s + 2 + 10 + 30 s of waiting ≈ 162 s.
 */
export const EXTERNAL_HTTP_RETRY_BACKOFF_MS: readonly number[] = [2_000, 10_000, 30_000];

/**
 * A server's `Retry-After` is honored up to this long, never more: an uncapped value
 * (say, one hour) would outlive the cron job. Same as the largest backoff.
 */
export const RETRY_AFTER_MAX_MS = Math.max(...EXTERNAL_HTTP_RETRY_BACKOFF_MS);

/**
 * The nightly pipeline's time budget (cron route only; a manual full load may take hours).
 * - `cronMaxDurationS`: Vercel's hard limit for the cron route. The route file must export the
 *   same number as a literal (Next reads it statically); `cronRoute.test.ts` fails if they drift.
 * - `ingestBudgetMs`: after this, the ingest starts no new hub and no new HTTP attempt, so
 *   scoring always runs on the data already stored. The rest of the time is for scoring.
 * - `lockMinutes`: a run that started this recently and hasn't finished blocks a second run
 *   (see pipeline/pipelineGuard.ts). Longer than `cronMaxDurationS`, so a killed run stops blocking after it.
 */
export const PIPELINE_TIMING = {
  cronMaxDurationS: 300,
  ingestBudgetMs: 200_000,
  lockMinutes: 10,
} as const;

/** Per-request timeout for Supabase (PostgREST) calls. */
export const DATABASE_TIMEOUT_MS = 15_000;

/**
 * The answering model (OpenRouter, via the AI SDK).
 * - `attemptMs`: one model attempt (all its steps). A turn has up to 2 attempts (validation retry).
 * - `stepMs`: one model step. `toolMs`: one tool call.
 * - `turnMs`: the whole turn, across both attempts. Kept well under the chat route's
 *   `maxDuration`, which also has to cover the guard, database reads and saving the turn.
 */
export const AGENT_TIMEOUTS = { attemptMs: 60_000, stepMs: 25_000, toolMs: 10_000, turnMs: 100_000 } as const;

/** The out-of-scope guard (Jev). After this the message is let through (fail open, D118). */
export const GUARD_TIMEOUT_MS = 2_000;

/** One judge call in the evals. */
export const JUDGE_TIMEOUT_MS = 45_000;
