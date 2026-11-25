/**
 * @module evals/lib/guards
 *
 * Process-level guard for the scripts that call the answering model (`npm run eval`, `npm run ask`; D108).
 * `@openrouter/ai-sdk-provider` 3.1.0 cancels an aborted stream with `reader.cancel(reason)` and
 * never handles the returned promise, so every step timeout leaves one unhandled rejection. Plain
 * Node treats that as fatal and the whole eval run died. (Next.js registers its own listener that
 * only logs, so the app itself was never at risk.) The turn has already failed cleanly by then, so
 * the guard logs the stray rejection and carries on. Anything else still crashes.
 */
import { boundaryLogLine, describeUnknownError, formatBoundaryMessage } from "../../src/core/errors/boundaryError";

/**
 * Whether a rejection is the provider's stray abort/timeout.
 * @param reason - the rejection reason.
 * @returns true for TimeoutError / AbortError.
 */
export function isStrayAbort(reason: unknown): boolean {
  return typeof reason === "object" && reason !== null && "name" in reason && (reason.name === "TimeoutError" || reason.name === "AbortError");
}

/**
 * The `unhandledRejection` listener: logs a stray abort and carries on; anything else is logged and exits.
 * We can't prove where a stray abort came from, so the log says "likely".
 * @param reason - the rejection reason.
 */
function onUnhandledRejection(reason: unknown): void {
  if (!isStrayAbort(reason)) {
    console.error(boundaryLogLine(reason, "installStrayAbortGuard", "script"));
    process.exit(1);
  }
  const line = formatBoundaryMessage({
    name: "StrayAbortRejection",
    message: `Ignored an unhandled "${describeUnknownError(reason)}", likely the OpenRouter provider's known stray abort (3.1.0 bug); the turn it belonged to has already failed and is reported`,
    functionName: "installStrayAbortGuard",
    boundary: "llm",
  });
  console.error(`\n${line}`);
}

/**
 * Installs the guard. Idempotent: calling it again doesn't add a second listener.
 */
export function installStrayAbortGuard(): void {
  if (process.listeners("unhandledRejection").includes(onUnhandledRejection)) return;
  process.on("unhandledRejection", onUnhandledRejection);
}

/**
 * Removes the guard (for tests).
 */
export function uninstallStrayAbortGuard(): void {
  process.off("unhandledRejection", onUnhandledRejection);
}
