/**
 * @module app/_lib/copy
 *
 * Small pieces of UI copy used in more than one place (single source of truth). Error copy
 * lives in `clientErrors.ts` (browser-side problems) and `core/errors/userErrors.ts` (the API's).
 */

/** Shown while the agent hasn't reported anything yet. */
export const READING_QUESTION = "Reading the question…";

/** Shown while a saved chat is loading. */
export const OPENING_CHAT = "Opening your chat…";

/** Tooltip on anything that asks a question while an answer is still coming. */
export const BUSY_HINT = "Wait for the current answer to finish.";

/** Under a draft the person stopped: it never went through the number checks. */
export const STOPPED_DRAFT = "Stopped — this draft wasn't checked against the data.";

/** When the person stopped before any text arrived. */
export const STOPPED_EMPTY = "Stopped before an answer was ready.";

/** Under a draft that was cut off (connection, timeout): it never went through the number checks. */
export const UNCHECKED_DRAFT = "This draft wasn't checked against the data.";

/** What the always-present screen-reader status line says (S7). */
export const LIVE_STATUS = {
  working: "Working on your answer…",
  ready: "Answer ready.",
  stopped: "Stopped.",
  failed: "The answer didn't finish.",
  opened: "Chat opened.",
} as const;
