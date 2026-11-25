/**
 * @module app/_lib/fetchJson
 *
 * Every browser request to our API goes through here (S3): a timeout on each one, plus an
 * optional outside signal so a newer action (opening another chat, unmounting) can cancel it.
 */

/** How long a plain JSON request may take before we give up. */
export const DEFAULT_TIMEOUT_MS = 15_000;

/** A response that wasn't 2xx. `body` is the parsed JSON (our API sends `{ error: {...} }`), or null. */
export class HttpError extends Error {
  /**
   * @param status - the HTTP status.
   * @param body - the parsed response body, or null.
   */
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`HTTP ${status}`);
    this.name = "HttpError";
  }
}

/**
 * A signal that aborts after `ms`, or earlier when `external` aborts.
 * @param ms - the timeout.
 * @param external - an optional caller signal (e.g. a newer request replaced this one).
 * @returns the combined signal.
 */
export function timeoutSignal(ms: number, external?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  if (!external) return timeout;
  if (typeof AbortSignal.any === "function") return AbortSignal.any([external, timeout]);
  // Older browsers: forward whichever fires first.
  const controller = new AbortController();
  for (const signal of [external, timeout]) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

/** Options for {@link fetchJson}. */
export interface FetchJsonOptions {
  /** Cancels the request early (e.g. the component unmounted). */
  signal?: AbortSignal;
  /** Overrides {@link DEFAULT_TIMEOUT_MS}. */
  timeoutMs?: number;
  /** Method, headers, body… (the signal is set here). */
  init?: Omit<RequestInit, "signal">;
}

/**
 * Fetches JSON with a timeout.
 * @param url - the API path.
 * @param options - signal, timeout and request options.
 * @returns the parsed body.
 * @throws HttpError for a non-2xx status; the browser's error on a network failure, timeout or abort.
 */
export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const res = await fetch(url, { ...options.init, signal: timeoutSignal(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, options.signal) });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) throw new HttpError(res.status, body);
  if (body === null) throw new HttpError(res.status, null); // a 2xx without JSON is just as unusable
  return body as T;
}
