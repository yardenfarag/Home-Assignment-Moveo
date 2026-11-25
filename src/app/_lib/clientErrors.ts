/**
 * @module app/_lib/clientErrors
 *
 * Friendly copy for problems that happen in the BROWSER (no connection, a hung request, a chart
 * that can't be drawn), and the mapping from a failed chat request to one friendly card (B5).
 * All the copy lives in `core/errors/userErrors.ts` (single source); this file maps browser
 * failures to it and logs UI errors (🦋). Never shows raw error text.
 */
import { boundaryLogLine } from "@/core/errors/boundaryError";
import {
  ANSWER_STALLED,
  CONNECTION_FAILED,
  STREAM_INTERRUPTED,
  USER_ERROR_CODES,
  USER_ERRORS,
  userError,
  type ChatError,
  type UserErrorCode,
} from "@/core/errors/userErrors";

// The browser-side copy lives with the rest in core/errors/userErrors.ts; re-exported for the UI.
export { ANSWER_STALLED, CHAT_OPEN_FAILED, CONNECTION_FAILED, EVAL_COPY, MESSAGE_FAILED, SESSIONS_FAILED, VISUAL_FAILED, type ChatError } from "@/core/errors/userErrors";

/**
 * Logs a UI rendering failure in the project's format: `ErrorName || message || where || 🦋`.
 * @param error - what was thrown.
 * @param where - the part of the UI that failed.
 */
export function logUiError(error: unknown, where: string): void {
  console.error(boundaryLogLine(error, where, "ui"));
}

/**
 * True for a browser network failure (fetch throws a TypeError such as "Failed to fetch",
 * "NetworkError when attempting to fetch resource" or Safari's "Load failed").
 * @param error - what the request threw.
 * @returns whether it was the connection.
 */
export function isNetworkError(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;
  const message = error.message.toLowerCase();
  return message.includes("fetch") || message.includes("network") || message === "load failed";
}

/**
 * The error code whose friendly message is exactly this text (the stream's `onError` sends one of them).
 * @param text - a plain-text error message.
 * @returns the code, or null when the text isn't one of ours.
 */
function codeForMessage(text: string): UserErrorCode | null {
  const trimmed = text.trim();
  return USER_ERROR_CODES.find((code) => USER_ERRORS[code].message === trimmed) ?? null;
}

/**
 * Reads our API's `{ error: { code, message, hint, retryable } }` body out of an error message.
 * @param text - the error message (the response body for HTTP errors).
 * @returns the error card, or null when the text isn't that JSON.
 */
function errorFromJson(text: string): ChatError | null {
  try {
    const parsed = JSON.parse(text) as { error?: Partial<ChatError> } | null;
    const body = parsed?.error;
    if (!body || typeof body.message !== "string" || !body.message) return null;
    const code = USER_ERROR_CODES.includes(body.code as UserErrorCode) ? (body.code as UserErrorCode) : "internal_error";
    const fallback = userError(code);
    return {
      code,
      message: body.message,
      hint: typeof body.hint === "string" ? body.hint : fallback.hint,
      retryable: typeof body.retryable === "boolean" ? body.retryable : fallback.retryable,
    };
  } catch {
    return null;
  }
}

/**
 * Turns a failed chat request into ONE friendly card (B5): our API's JSON error, our stream's
 * friendly plain text, a connection problem, a timeout, or — for anything else — the generic one.
 * @param error - the error useChat reported.
 * @param midStream - true when part of the answer had already arrived (a drop then reads "stopped before it finished").
 * @returns the card's content.
 */
export function requestError(error: Error, midStream = false): ChatError {
  if (error.name === "TimeoutError") return ANSWER_STALLED;
  if (isNetworkError(error)) return midStream ? STREAM_INTERRUPTED : CONNECTION_FAILED;
  const fromJson = errorFromJson(error.message);
  if (fromJson) return fromJson;
  const known = codeForMessage(error.message);
  const { code, message, hint, retryable } = userError(known ?? "internal_error");
  return { code, message, hint, retryable };
}
