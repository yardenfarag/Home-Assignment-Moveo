/**
 * @module core/agent/config
 *
 * Agent limits (G8) and memory size (G7) — the single source of truth.
 * (The model's timeouts live with every other deadline in `config/timeouts.ts`.)
 */

/** Hard limits on one agent turn. */
export const AGENT_LIMITS = {
  /** Longest accepted user message, in characters. */
  maxUserMessageChars: 1_000,
  /** Tool-calling steps before the final answer must be produced. */
  maxToolSteps: 6,
  /** Max tokens the model may write per step (G14: raised from 1,500 after a long answer was cut off mid-JSON). */
  maxOutputTokens: 3_000,
  /** Extra attempts when the final answer fails validation (G3/G8). */
  validationRetries: 1,
} as const;

/** How many chats a browser remembers, and how many `GET /api/chat/sessions` accepts at once. */
export const REMEMBERED_CHATS_LIMIT = 50;

/**
 * How many past turns the model sees (G7). Each turn is the question, its tool calls and results, and
 * the answer, kept whole (cutting a turn would separate a tool call from its result). 5 turns ≈ the last
 * ~10 user/assistant messages: enough for follow-ups, and every older turn would be paid for again on
 * every request (D136; was 10).
 */
export const HISTORY_TURNS = 5;

/** Fixed disclaimer added by CODE to every recommendation (D8) — the LLM cannot weaken it. */
export const RECOMMENDATION_DISCLAIMER =
  "Decision support based on weather exposure only. It does not include hub volume, upgrade costs or existing resilience. Final decisions belong to your team.";

/** Start of the message sent back to the model when its answer fails validation (stored in history, hidden from users). */
export const RETRY_FEEDBACK_PREFIX = "Your previous answer was rejected by validation:";

/** The brief's four example questions: shown on the start screen and on the guard's decline card. */
export const EXAMPLE_QUESTIONS = [
  "Which hubs in the Midwest are most exposed to winter disruption?",
  "Compare Miami and Houston in terms of hurricane and flood exposure.",
  "What percentage of days in Denver last year had snowfall?",
  "Why is the Dallas hub's weather disruption risk high?",
] as const;
