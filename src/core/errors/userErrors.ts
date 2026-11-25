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
import { AgentInputError } from "./agentInputError";
import { BoundaryError } from "./boundaryError";

/** Error codes the API can return. */
export const USER_ERROR_CODES = ["invalid_request", "unauthorized", "no_data", "agent_failed", "internal_error"] as const;

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
    message: "Please sign in to use The Daily Prophet.",
    hint: "Use the username and password you were given. If you don't have them, ask whoever shared this link with you.",
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
 * Builds the user-facing error for a code (optionally with a more specific message).
 * @param code - the error code.
 * @param message - a specific friendly message to use instead of the default.
 * @returns the user error.
 */
export function userError(code: UserErrorCode, message?: string): UserError {
  return { code, ...USER_ERRORS[code], ...(message ? { message } : {}) };
}

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
