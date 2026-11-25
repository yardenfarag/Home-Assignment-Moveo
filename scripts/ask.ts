/**
 * @module scripts/ask
 *
 * Dev tool (G10): ask the real agent one question from the terminal.
 *   npm run ask -- "Why is the Dallas hub's risk high?"
 *   npm run ask -- --session=<id> "And what about its flood score?"   (follow-up)
 *   npm run ask -- --metric "How much snow…"                          (metric units)
 * Prints live progress, then the checked answer.
 */
import { createAnswerQuestionDeps } from "../src/core/agent/createAnswerQuestionDeps";
import { answerQuestion } from "../src/core/agent/answerQuestion";

/** Reads `--name=value` from argv or (PowerShell) `npm_config_name`. */
function flag(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? process.env[`npm_config_${name}`];
}

/** Runs one question and prints the result. */
async function main(): Promise<void> {
  const message = process.argv.slice(2).filter((a) => !a.startsWith("--")).join(" ");
  if (!message) {
    console.error('Usage: npm run ask -- "your question" [--session=<id>] [--metric]');
    process.exit(1);
  }
  const units = process.argv.includes("--metric") || process.env.npm_config_metric === "true" ? "metric" : "us";
  const started = Date.now();
  const result = await answerQuestion({ sessionId: flag("session") ?? null, message, units }, createAnswerQuestionDeps(), {
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
      `${result.usage.inputTokens} in / ${result.usage.outputTokens} out tokens · ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
  console.log(`Session: ${result.sessionId}  (follow up with --session=${result.sessionId})`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
