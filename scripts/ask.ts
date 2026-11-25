/**
 * @module scripts/ask
 *
 * Dev tool (G10): ask the real agent one question from the terminal.
 *   npm run ask -- "Why is the Dallas hub's risk high?"
 *   npm run ask -- --session=<id> "And what about its flood score?"   (follow-up)
 * Prints live progress, then the checked answer.
 */
import { createAnswerQuestionDeps } from "../src/core/agent/createAnswerQuestionDeps";
import { answerQuestion } from "../src/core/agent/answerQuestion";
import { installStrayAbortGuard } from "../evals/lib/guards";
import { flag, positionalArgs, UsageError } from "./lib/cli";
import { runScript } from "./lib/run";

/** Runs one question and prints the result. */
async function main(): Promise<void> {
  // Same provider as the evals, so the same stray-abort rejection can happen on a step timeout (D108).
  installStrayAbortGuard();
  const message = positionalArgs().join(" ");
  if (!message) throw new UsageError('Usage: npm run ask -- "your question" [--session=<id>]');
  const started = Date.now();
  const result = await answerQuestion({ sessionId: flag("session") ?? null, message, units: "us" }, createAnswerQuestionDeps(), {
    onToolStart: (tool, input) => console.log(`🔧 ${tool} ${JSON.stringify(input)}`),
    onRetry: (problems) => console.log(`🔁 retrying: ${problems.join(" | ")}`),
  });
  const a = result.answer;
  console.log(`\n${a.answer}\n`);
  if (a.premiseCheck) console.log(`Premise: ${a.premiseCheck.claimedLevel} → actual ${a.premiseCheck.actualLevel} (holds: ${a.premiseCheck.holds})`);
  console.log(`Confidence: ${a.confidence ?? "n/a"}${a.meta.confidenceOverridden ? " (set by code)" : ""} · out of scope: ${a.outOfScope}`);
  console.log(`Data used: ${a.dataUsed.map((d) => `${d.label}=${d.value} ${d.unit}`).join("; ") || "none"}`);
  if (a.recommendation) console.log(`Recommendation: ${a.recommendation.stance} — ${a.recommendation.summary}\n  ⚠️ ${a.recommendation.disclaimer}`);
  console.log(`Limitations (${a.limitations.length}): ${a.limitations.slice(0, 3).join(" / ")}${a.limitations.length > 3 ? " …" : ""}`);
  if (a.meta.warnings.length) console.log(`Warnings: ${a.meta.warnings.join(" | ")}`);
  console.log(
    `\n${a.meta.model} · ${a.meta.toolCalls.length} tool calls · retried ${a.meta.retried} · ` +
      `${result.usage.inputTokens} in (${result.usage.cachedInputTokens} from the prompt cache) / ${result.usage.outputTokens} out tokens · ` +
      `${result.usage.costUsd === null ? "cost not reported" : `$${result.usage.costUsd.toFixed(4)} charged`} · ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
  console.log(`Session: ${result.sessionId}  (follow up with --session=${result.sessionId})`);
}

void runScript(main, "scripts/ask");
