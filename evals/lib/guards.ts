/**
 * @module evals/lib/guards
 *
 * Process-level guard for the eval script (D108). `@openrouter/ai-sdk-provider` 3.1.0
 * cancels an aborted stream with `reader.cancel(reason)` and never handles the returned
 * promise, so every step timeout leaves one unhandled rejection. Plain Node treats that as
 * fatal and the whole eval run died. (Next.js registers its own listener that only logs,
 * so the app itself was never at risk.) The turn has already failed cleanly by then, so
 * the guard logs the stray rejection and carries on. Anything else still crashes.
 */
import { describeUnknownError, formatBoundaryMessage } from "../../src/core/errors/boundaryError";

/**
 * Whether a rejection is the provider's stray abort/timeout.
 * @param reason - the rejection reason.
 * @returns true for TimeoutError / AbortError.
 */
export function isStrayAbort(reason: unknown): boolean {
  return typeof reason === "object" && reason !== null && "name" in reason && (reason.name === "TimeoutError" || reason.name === "AbortError");
}

/** Installs the guard (call once at the start of a script). */
export function installStrayAbortGuard(): void {
  process.on("unhandledRejection", (reason) => {
    if (!isStrayAbort(reason)) {
      console.error(describeUnknownError(reason));
      process.exit(1);
    }
    const line = formatBoundaryMessage({
      name: "StrayAbortRejection",
      message: `Ignored a stray "${describeUnknownError(reason)}" from the OpenRouter provider (known 3.1.0 bug); the turn already failed cleanly`,
      functionName: "installStrayAbortGuard",
      boundary: "llm",
    });
    console.error(`\n${line}`);
  });
}
