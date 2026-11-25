/**
 * @module app/_lib/clientErrors
 *
 * Friendly copy for problems that happen in the BROWSER (no connection, a hung request, a chart
 * that can't be drawn), and the mapping from a failed chat request to one friendly card (B5).
 * The API's own error copy stays in `core/errors/userErrors.ts`; this file only adds what the
 * server can't know about. Never shows raw error text.
 */
import type { SneakoscopeDataParts } from "@/core/api/chatStream";
import { STREAM_INTERRUPTED, USER_ERROR_CODES, USER_ERRORS, userError, type UserErrorCode } from "@/core/errors/userErrors";

/** The error card's content (same shape as the stream's `data-error` part). */
export type ChatError = SneakoscopeDataParts["error"];

/** The request never reached us (offline, DNS, the network dropped before the answer began). */
export const CONNECTION_FAILED: ChatError = {
  code: "internal_error",
  message: "I couldn't reach Sneakoscope just now. 🙀",
  hint: "Check your internet connection, then try again.",
  retryable: true,
};

/** Nothing new arrived for a long while (the watchdog stopped waiting) or the request timed out. */
export const ANSWER_STALLED: ChatError = {
  code: "internal_error",
  message: "The answer stalled, so I stopped waiting.",
  hint: "Please try again in a moment.",
  retryable: true,
};

/** A saved chat couldn't be loaded (B2). */
export const CHAT_OPEN_FAILED = "Couldn't open that chat. Try again.";

/** The chat list couldn't be loaded (S4). */
export const SESSIONS_FAILED = "Couldn't load your chats right now.";

/** One chart under an answer couldn't be drawn (S11). The answer text itself was already checked. */
export const VISUAL_FAILED = "This chart couldn't be drawn. The answer above is unaffected.";

/** A whole saved answer couldn't be shown (e.g. it was stored in an older format). */
export const MESSAGE_FAILED = "I couldn't show this answer. Try asking the question again.";

/** Eval run (D130): copy for a run streamed in this browser. */
export const EVAL_COPY = {
  couldNotStart: "The evals couldn't start right now. Please try again later.",
  noConnection: "The evals couldn't start right now. Please check your connection and try again.",
  dropped: "The connection dropped before the run finished. The results may still show up here in a few minutes.",
  stalled: "I haven't heard from the run for a while, so I stopped watching. The results may still show up here in a few minutes.",
  unreadable: "Some progress updates couldn't be read. The results may still show up here in a few minutes.",
} as const;

/** Fixed animal emoji for errors caught while drawing the UI (the server's boundaries have theirs in `boundaryError.ts`). */
export const UI_BOUNDARY_EMOJI = "🦋";

/**
 * Logs a UI rendering failure in the project's format: `ErrorName || message || where || emoji`.
 * @param error - what was thrown.
 * @param where - the part of the UI that failed.
 */
export function logUiError(error: unknown, where: string): void {
  const name = error instanceof Error ? error.name : "RenderError";
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${name} || ${message} || ${where} || ${UI_BOUNDARY_EMOJI}`);
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
