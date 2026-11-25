/**
 * @module core/config/timeouts
 *
 * Every deadline for calls that leave our process, in one place.
 * Rule (CLAUDE.md): every external call has a timeout — no exceptions.
 */

/** Per-request timeout for external HTTP APIs (Open-Meteo, FEMA). */
export const EXTERNAL_HTTP_TIMEOUT_MS = 30_000;

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
