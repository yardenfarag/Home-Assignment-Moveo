/**
 * @module core/errors/boundaryError
 *
 * One error format for every failure at a system boundary (external APIs,
 * database, LLM, Jev, API routes, configuration), so a log line is easy to
 * locate at a glance:
 *
 *   `ErrorName || message || functionName || 🐘`
 *
 * Each boundary has a fixed animal emoji (searchable in logs).
 * Pure functions (scoring, stats) do NOT use this — they just throw plain errors.
 */

/** Fixed emoji per boundary, so you can grep logs by where the error came from. */
export const BOUNDARY_EMOJI = {
  llm: "🦉",
  openMeteo: "🐸",
  fema: "🦡",
  database: "🐘",
  apiRoute: "🦄",
  jev: "🐍",
  config: "🦔",
  /** Something that failed while drawing the UI in the browser (caught by an error boundary). */
  ui: "🦋",
} as const;

/** Name of a system boundary where errors are caught and wrapped. */
export type Boundary = keyof typeof BOUNDARY_EMOJI;

/** Everything needed to build a {@link BoundaryError}. */
export interface BoundaryErrorOptions {
  /** Short PascalCase error name, e.g. `OpenMeteoFetchError`. */
  name: string;
  /** Human-readable explanation. Must never contain secrets. */
  message: string;
  /** The function in which the error happened, e.g. `fetchDailyWeather`. */
  functionName: string;
  /** Which boundary failed; selects the emoji. */
  boundary: Boundary;
  /** The original error, kept for debugging. */
  cause?: unknown;
}

/**
 * Builds the unified message string `ErrorName || message || functionName || emoji`.
 * @param options - the error parts.
 * @returns the formatted single-line message.
 */
export function formatBoundaryMessage(options: Omit<BoundaryErrorOptions, "cause">): string {
  const emoji = BOUNDARY_EMOJI[options.boundary];
  return `${options.name} || ${options.message} || ${options.functionName} || ${emoji}`;
}

/**
 * Error thrown when something outside our own code fails.
 * Its `message` is already in the unified format.
 */
export class BoundaryError extends Error {
  /** Which boundary failed. */
  readonly boundary: Boundary;
  /** The function in which the error happened. */
  readonly functionName: string;
  /** The plain explanation without the formatting (safe to show users). */
  readonly detail: string;

  /**
   * @param options - error name, message, function name, boundary and optional cause.
   */
  constructor(options: BoundaryErrorOptions) {
    super(formatBoundaryMessage(options), { cause: options.cause });
    this.name = options.name;
    this.boundary = options.boundary;
    this.functionName = options.functionName;
    this.detail = options.message;
  }
}

/**
 * The log line for something caught at an outer boundary (an API route, a stream). A BoundaryError
 * is logged as it is (it's already formatted, and names where it really failed); anything else
 * is formatted for the outer boundary.
 * @param error - what was caught.
 * @param functionName - the catching function.
 * @param boundary - the catching boundary.
 * @returns one formatted log line.
 */
export function boundaryLogLine(error: unknown, functionName: string, boundary: Boundary): string {
  if (error instanceof BoundaryError) return `${error.message} (caught in ${functionName})`;
  return formatBoundaryMessage({ name: error instanceof Error ? error.name : "UnknownError", message: describeUnknownError(error), functionName, boundary });
}

/**
 * Turns any thrown value into a readable string (errors thrown by libraries
 * are not always `Error` instances).
 * @param error - whatever was thrown.
 * @returns a short description.
 */
export function describeUnknownError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
