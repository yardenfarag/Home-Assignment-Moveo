/**
 * @module core/errors/agentInputError
 *
 * A problem with the user's question itself (empty, too long). Its message is
 * already friendly and is shown to the user as-is (HTTP 400).
 */

/** Error shown to users when the question itself is invalid (maps to HTTP 400). */
export class AgentInputError extends Error {
  /** @param message - user-facing reason. */
  constructor(message: string) {
    super(message);
    this.name = "AgentInputError";
  }
}
