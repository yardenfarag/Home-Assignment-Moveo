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
