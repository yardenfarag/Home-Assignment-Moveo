/**
 * @module core/agent/config
 *
 * Agent limits (G8) and memory size (G7) — the single source of truth.
 */

/** Hard limits on one agent turn. */
export const AGENT_LIMITS = {
  /** Longest accepted user message, in characters. */
  maxUserMessageChars: 1_000,
  /** Tool-calling steps before the final answer must be produced. */
  maxToolSteps: 6,
  /** Timeouts for the whole turn, each model step, and each tool call. */
  timeouts: { totalMs: 60_000, stepMs: 25_000, toolMs: 10_000 },
  /** Max tokens the model may write per step (G14: raised from 1,500 after a long answer was cut off mid-JSON). */
  maxOutputTokens: 3_000,
  /** Extra attempts when the final answer fails validation (G3/G8). */
  validationRetries: 1,
} as const;

/** How many past turns (user message + agent reply) the model sees (G7). */
export const HISTORY_TURNS = 10;

/** Fixed disclaimer added by CODE to every recommendation (D8) — the LLM cannot weaken it. */
export const RECOMMENDATION_DISCLAIMER =
  "Decision support based on weather exposure only. It does not include hub volume, upgrade costs or existing resilience. Final decisions belong to your team.";

/** Start of the message sent back to the model when its answer fails validation (stored in history, hidden from users). */
export const RETRY_FEEDBACK_PREFIX = "Your previous answer was rejected by validation:";
