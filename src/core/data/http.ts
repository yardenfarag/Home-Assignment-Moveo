/**
 * @module core/data/http
 *
 * Shared `fetch` wrapper for external APIs: per-request timeout, retries on
 * rate limits (429), server errors (5xx) and network failures, and errors in
 * the unified boundary format.
 */
import { EXTERNAL_HTTP_TIMEOUT_MS } from "../config/timeouts";
import { BoundaryError, describeUnknownError, type Boundary } from "../errors/boundaryError";

/** A `fetch`-compatible function (injectable for tests). */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Waits for the given milliseconds (injectable for tests). */
export type SleepFn = (ms: number) => Promise<void>;

/** Default sleep using a timer. */
export const sleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Options for {@link fetchJsonWithRetry}. */
export interface FetchJsonOptions {
  url: string;
  boundary: Boundary;
  functionName: string;
  /** Error name used when every attempt fails, e.g. `OpenMeteoFetchError`. */
  errorName: string;
  fetchImpl?: FetchLike;
  sleepImpl?: SleepFn;
  /** Wait before each retry (its length = number of retries). */
  backoffMs?: number[];
  timeoutMs?: number;
}

/**
 * Wraps a `fetch` so every request gets a deadline. If the caller passed its own
 * abort signal, the request stops at whichever fires first. Used for libraries
 * that call `fetch` themselves (e.g. supabase-js) and have no timeout option.
 * @param baseFetch - the fetch to wrap.
 * @param timeoutMs - deadline per request.
 * @returns a fetch with the deadline applied.
 */
export function withTimeout(baseFetch: typeof fetch, timeoutMs: number): typeof fetch {
  return (input, init) => {
    const deadline = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
    return baseFetch(input, { ...init, signal });
  };
}

/** True for responses worth retrying. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Fetches JSON with timeout and retries.
 * @param options - URL, error labels and injectable fetch/sleep.
 * @returns the parsed JSON body (unvalidated — callers validate with Zod).
 * @throws BoundaryError after the last failed attempt or on a non-retryable HTTP error.
 */
export async function fetchJsonWithRetry(options: FetchJsonOptions): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepImpl = options.sleepImpl ?? sleep;
  const backoff = options.backoffMs ?? [2_000, 10_000, 30_000];
  let lastProblem = "unknown error";

  for (let attempt = 0; attempt <= backoff.length; attempt++) {
    try {
      const response = await fetchImpl(options.url, {
        signal: AbortSignal.timeout(options.timeoutMs ?? EXTERNAL_HTTP_TIMEOUT_MS),
      });
      if (response.ok) return await response.json();

      const body = (await response.text()).slice(0, 300);
      lastProblem = `HTTP ${response.status}: ${body}`;
      if (!isRetryableStatus(response.status)) break;

      const retryAfterSeconds = Number(response.headers.get("retry-after"));
      if (attempt < backoff.length) {
        await sleepImpl(retryAfterSeconds > 0 ? retryAfterSeconds * 1_000 : backoff[attempt]);
      }
    } catch (error) {
      lastProblem = `network error: ${describeUnknownError(error)}`;
      if (attempt < backoff.length) await sleepImpl(backoff[attempt]);
    }
  }

  throw new BoundaryError({
    name: options.errorName,
    message: `Request failed (${lastProblem})`,
    functionName: options.functionName,
    boundary: options.boundary,
  });
}
