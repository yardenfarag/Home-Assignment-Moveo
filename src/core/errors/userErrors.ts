/**
 * @module core/errors/userErrors
 *
 * What users see when something goes wrong (A4, UX-first): a warm, plain
 * message, a hint about what to do next, and whether retrying can help.
 * Technical detail never appears here — it goes to the server log
 * (`ErrorName || message || fn || emoji`) and the `events` table.
 * ALL user-facing error copy lives in this one file.
 */
import { ZodError } from "zod";
import { EVAL_RUN_LIMITS, type EvalGateStatus } from "../api/evalGate";
import { AgentInputError } from "./agentInputError";
import { BoundaryError } from "./boundaryError";

/** Error codes the API can return. */
export const USER_ERROR_CODES = ["invalid_request", "unauthorized", "too_many_requests", "daily_limit", "no_data", "agent_failed", "internal_error"] as const;

/** One of the API error codes. */
export type UserErrorCode = (typeof USER_ERROR_CODES)[number];

/** The error body the browser receives: `{ error: UserError }` (minus `status`). */
export interface UserError {
  code: UserErrorCode;
  /** Friendly, plain-language message. */
  message: string;
  /** What the user can do next. */
  hint: string;
  /** Whether trying again may work (the UI shows a "Try again" button). */
  retryable: boolean;
  /** HTTP status code. */
  status: number;
}

/** The copy for each error code. */
export const USER_ERRORS: Record<UserErrorCode, Omit<UserError, "code">> = {
  invalid_request: {
    status: 400,
    message: "I couldn't quite read that question.",
    hint: "Try asking it in a sentence or two — for example: “Which hubs are most exposed to flooding?”",
    retryable: false,
  },
  unauthorized: {
    status: 401,
    message: "This address is only for Sneakoscope's nightly data job.",
    hint: "To use Sneakoscope, open the home page and ask a question. 🐱",
    retryable: false,
  },
  too_many_requests: {
    status: 429,
    message: "You're asking faster than I can keep up. 😸",
    hint: "Please take a short break and try again in a few minutes.",
    retryable: false,
  },
  daily_limit: {
    status: 429,
    message: "Sneakoscope has answered a lot of questions today. 🐱",
    hint: "The daily limit resets at midnight UTC. Please come back tomorrow.",
    retryable: false,
  },
  no_data: {
    status: 503,
    message: "Today's weather data hasn't landed yet. 🐱",
    hint: "Scores refresh every night. Please try again in a few minutes.",
    retryable: true,
  },
  agent_failed: {
    status: 502,
    message: "I couldn't put together an answer I can stand behind this time.",
    hint: "I'd rather say so than guess. Try asking again — naming one or two hubs or a single hazard usually helps.",
    retryable: true,
  },
  internal_error: {
    status: 500,
    message: "Something went wrong on our side. 😿",
    hint: "It's not you — please try again in a moment. If it keeps happening, let the team know.",
    retryable: true,
  },
};

/**
 * Builds the user-facing error for a code, optionally with a more specific message and hint.
 * @param code - the error code.
 * @param message - a specific friendly message to use instead of the default.
 * @param hint - a specific next step to use instead of the default.
 * @returns the user error.
 */
export function userError(code: UserErrorCode, message?: string, hint?: string): UserError {
  return { code, ...USER_ERRORS[code], ...(message ? { message } : {}), ...(hint ? { hint } : {}) };
}

/** A message and hint for one specific situation (refines a code's default copy). */
export interface ErrorCopy {
  message: string;
  hint: string;
}

/** A chat link or saved chat id that isn't valid (code `invalid_request`). */
export const INVALID_CHAT_LINK: ErrorCopy = {
  message: "That chat couldn't be opened.",
  hint: "Start a new chat, or pick one from Your chats.",
};

/** Why an eval run from the app can't start now (code `too_many_requests`, D130). */
export const EVAL_RUN_REFUSALS: Record<NonNullable<EvalGateStatus["reason"]>, ErrorCopy> = {
  running: { message: "An eval run is already in progress.", hint: "Its results will show up here in a few minutes." },
  too_soon: {
    message: "The evals ran just a little while ago.",
    hint: `To keep costs sane, they can run once every ${EVAL_RUN_LIMITS.minutesBetweenRuns} minutes.`,
  },
  daily_limit: { message: `The evals have run ${EVAL_RUN_LIMITS.runsPerDay} times today.`, hint: "The daily limit resets at midnight UTC." },
};

/** Streamed when an eval run from the app fails partway. */
export const EVAL_RUN_STOPPED = "The eval run stopped before it finished. Please try again later.";

/**
 * Classifies any thrown value into a friendly user error.
 * @param error - whatever was thrown.
 * @returns the user error (never contains internal details).
 */
export function toUserError(error: unknown): UserError {
  if (error instanceof AgentInputError) return userError("invalid_request", error.message);
  if (error instanceof ZodError) return userError("invalid_request");
  if (error instanceof BoundaryError) {
    if (error.name === "NoDataError") return userError("no_data");
    if (error.boundary === "llm") return userError("agent_failed");
  }
  return userError("internal_error");
}

/** Shown when a streamed answer stops before the validated answer arrives (e.g. the connection dropped). */
export const STREAM_INTERRUPTED: Omit<UserError, "status"> = {
  code: "internal_error",
  message: "The answer stopped before it finished.",
  hint: "Your connection may have dropped — please try again.",
  retryable: true,
};

// ---------------------------------------------------------------------------
// Problems only the BROWSER can see (no connection, a hung request, a chart that can't be drawn).
// Kept here with the rest of the copy; app/_lib/clientErrors.ts maps failures to them.
// ---------------------------------------------------------------------------

/** The error card's content in the browser (a UserError without the HTTP status). */
export type ChatError = Omit<UserError, "status">;

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

