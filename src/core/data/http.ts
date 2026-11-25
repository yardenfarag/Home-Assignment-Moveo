/**
 * @module core/data/http
 *
 * Shared `fetch` wrapper for external APIs: per-request timeout, retries on
 * rate limits (429), server errors (5xx) and network failures, and errors in
 * the unified boundary format. Every retry is logged, a server's `Retry-After`
 * is capped, and an optional deadline stops new attempts once a job's time is up.
 */
import { EXTERNAL_HTTP_RETRY_BACKOFF_MS, EXTERNAL_HTTP_TIMEOUT_MS, RETRY_AFTER_MAX_MS } from "../config/timeouts";
import { BoundaryError, describeUnknownError, formatBoundaryMessage, type Boundary } from "../errors/boundaryError";

/** A `fetch`-compatible function (injectable for tests). */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Waits for the given milliseconds (injectable for tests). */
export type SleepFn = (ms: number) => Promise<void>;

/** Default sleep using a timer. */
export const sleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The injectable parts of a request, shared by the API clients (Open-Meteo, FEMA). */
export interface HttpDeps {
  /** The fetch to use (default: global `fetch`). */
  fetchImpl?: FetchLike;
  /** How to wait between retries (default: a timer). */
  sleepImpl?: SleepFn;
  /** Where retry lines go, already in the boundary format (default: `console.warn`). */
  log?: (line: string) => void;
  /** Time (ms since epoch) after which no new attempt or retry wait starts; each attempt's timeout is shortened to fit. */
  deadlineAt?: number;
  /** The clock used for the deadline (default: `Date.now`). */
  now?: () => number;
}

/** Options for {@link fetchJsonWithRetry}. */
export interface FetchJsonOptions extends HttpDeps {
  /** The full request URL (no secrets in it: it can appear in logs). */
  url: string;
  /** Which boundary this API is; selects the emoji. */
  boundary: Boundary;
  /** The calling function, for the error line. */
  functionName: string;
  /** Error name used when every attempt fails, e.g. `OpenMeteoFetchError`. */
  errorName: string;
  /** Wait before each retry (its length = number of retries). */
  backoffMs?: readonly number[];
  /** Per-attempt timeout (default {@link EXTERNAL_HTTP_TIMEOUT_MS}). */
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

/**
 * True for responses worth retrying.
 * @param status - the HTTP status code.
 * @returns true for 429 and 5xx.
 */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * How long to wait before the next attempt: the server's `Retry-After` (seconds) when it
 * sent one, capped at {@link RETRY_AFTER_MAX_MS}, otherwise our own backoff.
 * @param retryAfterHeader - the raw `Retry-After` header, or null.
 * @param backoffMs - our backoff for this attempt.
 * @returns milliseconds to wait.
 */
export function retryWaitMs(retryAfterHeader: string | null, backoffMs: number): number {
  const seconds = Number(retryAfterHeader);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1_000, RETRY_AFTER_MAX_MS) : backoffMs;
}

/**
 * Fetches JSON with timeout and retries. Only the transport is retried: a 200 whose
 * body isn't JSON (e.g. an HTML maintenance page) fails at once with its own name.
 * @param options - URL, error labels and injectable fetch/sleep/log/clock.
 * @returns the parsed JSON body (unvalidated — callers validate with Zod).
 * @throws BoundaryError after the last failed attempt, on a non-retryable HTTP error,
 *   when the deadline is reached, or (`InvalidJsonResponseError`) when the body isn't JSON.
 */
export async function fetchJsonWithRetry(options: FetchJsonOptions): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepImpl = options.sleepImpl ?? sleep;
  const log = options.log ?? ((line: string) => console.warn(line));
  const now = options.now ?? Date.now;
  const backoff = options.backoffMs ?? EXTERNAL_HTTP_RETRY_BACKOFF_MS;
  const timeoutMs = options.timeoutMs ?? EXTERNAL_HTTP_TIMEOUT_MS;
  const attempts = backoff.length + 1;
  let lastProblem = "unknown error";
  let body: { text: string; contentType: string | null } | null = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const remainingMs = options.deadlineAt === undefined ? Infinity : options.deadlineAt - now();
    if (remainingMs <= 0) {
      lastProblem = `${lastProblem === "unknown error" ? "not started" : lastProblem}; out of time budget`;
      break;
    }
    let waitMs = backoff[attempt] ?? 0;
    try {
      const response = await fetchImpl(options.url, { signal: AbortSignal.timeout(Math.min(timeoutMs, remainingMs)) });
      if (response.ok) {
        body = { text: await response.text(), contentType: response.headers.get("content-type") };
        break;
      }
      lastProblem = `HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`;
      if (!isRetryableStatus(response.status)) break;
      waitMs = retryWaitMs(response.headers.get("retry-after"), waitMs);
    } catch (error) {
      lastProblem = `network error: ${describeUnknownError(error)}`;
    }

    if (attempt === attempts - 1) break;
    if (options.deadlineAt !== undefined && now() + waitMs >= options.deadlineAt) {
      lastProblem = `${lastProblem}; out of time budget, not retried`;
      break;
    }
    log(
      formatBoundaryMessage({
        name: options.errorName,
        message: `Attempt ${attempt + 1} of ${attempts} failed (${lastProblem.slice(0, 200)}); retrying in ${Math.round(waitMs / 1_000)} s`,
        functionName: options.functionName,
        boundary: options.boundary,
      }),
    );
    await sleepImpl(waitMs);
  }

  if (!body) {
    throw new BoundaryError({
      name: options.errorName,
      message: `Request failed (${lastProblem})`,
      functionName: options.functionName,
      boundary: options.boundary,
    });
  }
  try {
    return JSON.parse(body.text) as unknown;
  } catch (cause) {
    throw new BoundaryError({
      name: "InvalidJsonResponseError",
      message: `The server answered 200 but not with JSON (content-type ${body.contentType ?? "none"}): ${body.text.slice(0, 120)}`,
      functionName: options.functionName,
      boundary: options.boundary,
      cause,
    });
  }
}
