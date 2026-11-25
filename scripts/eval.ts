/**
 * @module scripts/eval
 *
 * `npm run eval` — runs the eval set (E1–E7) and prints pass/fail per case + totals.
 *
 *   npm run eval                              in-process, model from OPENROUTER_MODEL
 *   npm run eval -- --model=openai/gpt-6.1-terra   try another OpenRouter model (Step 8 bakeoff)
 *   npm run eval -- --repeat=3                run each case 3 times (consistency)
 *   npm run eval -- --case=denver-snow,top-5  only some cases
 *   npm run eval -- --url=https://…           against a deployed /api/chat
 *   npm run eval -- --publish                 also write docs/evals.md
 *   npm run eval -- --no-judge                skip the independent judge (J1–J4)
 *   npm run eval -- --rejudge=evals/results/<file>.json   re-check + re-judge saved answers, no agent calls (J8)
 *
 * Exit code 1 when any case fails. A JSON + Markdown report is saved in evals/results/.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createAnswerQuestionDeps } from "../src/core/agent/createAnswerQuestionDeps";
import { getCronEnv } from "../src/core/config/env";
import { recordEvent } from "../src/core/db/eventsRepository";
import { createJudgeModel } from "../src/core/judge/judgeAnswer";
import { EVAL_CASES } from "../evals/cases";
import { baseModel } from "../evals/lib/bakeoff";
import { installStrayAbortGuard } from "../evals/lib/guards";
import { judgeSelfTest, judgeTurns } from "../evals/lib/judging";
import { buildOracle } from "../evals/lib/oracle";
import { fetchPricing, markdownSummary, printFloodReview, printJudgeReport, printReport, softMetrics } from "../evals/lib/report";
import { runInProcess, runRemote } from "../evals/lib/runners";
import type { CaseRun, EvalCase, TurnResult } from "../evals/lib/types";

/** Reads `--name=value` (or PowerShell's `npm_config_name`). */
function flag(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : process.env[`npm_config_${name}`];
}

/** Reads a boolean `--name` flag. */
const has = (name: string) => process.argv.includes(`--${name}`) || process.env[`npm_config_${name}`] === "true";

/** A results file written by an earlier run (evals/results/*.json). */
interface SavedRun {
  label: string;
  runs: CaseRun[];
}

/**
 * Loads a saved results file for --rejudge.
 * @param path - path to the .json report.
 * @returns its label and runs.
 */
function loadSavedRun(path: string): SavedRun {
  const saved = JSON.parse(readFileSync(path, "utf8")) as SavedRun;
  if (!Array.isArray(saved.runs)) throw new Error(`${path} is not an eval results file (no "runs").`);
  return saved;
}

/**
 * Finds an eval case by id.
 * @param id - case id.
 * @returns the case.
 */
function findCase(id: string): EvalCase {
  const found = EVAL_CASES.find((c) => c.id === id);
  if (!found) throw new Error(`Saved case "${id}" no longer exists in evals/cases.ts.`);
  return found;
}

/** Runs the evals. */
async function main(): Promise<void> {
  installStrayAbortGuard();
  const url = flag("url");
  const repeat = Math.max(1, Number(flag("repeat") ?? 1));
  const only = flag("case")?.split(",").map((s) => s.trim());
  const cases = only ? EVAL_CASES.filter((c) => only.includes(c.id)) : EVAL_CASES;
  if (cases.length === 0) throw new Error(`No cases match --case=${only?.join(",")}. Known: ${EVAL_CASES.map((c) => c.id).join(", ")}`);

  // The oracle always reads the same data the agent sees (local DB access needed even in --url mode).
  const deps = createAnswerQuestionDeps({ modelOverride: flag("model") });
  const context = await deps.loadContext({ today: deps.today(), units: "us" });
  const oracle = buildOracle(context);
  const liveLabel = url ? `remote ${url}` : deps.agentModel.modelId;
  const rejudgeFile = flag("rejudge");

  const judge = has("no-judge") ? null : createJudgeModel();
  const saved = rejudgeFile ? loadSavedRun(rejudgeFile) : null;
  const provider = (id: string) => id.split("/")[0];
  const answering = saved ? baseModel(saved.label) : url ? null : deps.agentModel.modelId;
  if (judge && answering && provider(judge.modelId) === provider(answering)) {
    console.warn(`⚠️  The judge (${judge.modelId}) and the answering model (${answering}) share a provider; judges can favor their own family (D100, D111).`);
  }
  const label = saved ? `${saved.label} (rejudged)` : liveLabel;
  console.log(
    saved
      ? `Re-checking ${saved.runs.length} saved run(s) from ${rejudgeFile}${judge ? `, judged by ${judge.modelId}` : ""}…`
      : `Running ${cases.length} case(s) × ${repeat} on ${label}${judge ? `, judged by ${judge.modelId}` : ""}…`,
  );
  const selfTest = judge ? await judgeSelfTest(context, judge) : null;
  // Each job yields one case's turn results: saved answers (--rejudge, no agent calls) or a fresh run.
  const jobs: { evalCase: EvalCase; getResults: () => Promise<TurnResult[]> }[] = saved
    ? saved.runs.map((run) => ({ evalCase: findCase(run.caseId), getResults: async () => run.results }))
    : Array.from({ length: repeat }, () => cases).flat().map((evalCase) => ({
        evalCase,
        getResults: () =>
          url
            ? runRemote(evalCase, { baseUrl: url, operatorKey: getCronEnv().CRON_SECRET })
            : runInProcess(evalCase, deps.agentModel, context),
      }));
  const runs: CaseRun[] = [];
  for (const { evalCase, getResults } of jobs) {
    const results = await getResults();
    const checks = await evalCase.check(results, oracle);
    const judged = judge ? await judgeTurns(results, judge, context) : null;
    const allChecks = [...checks, ...(judged?.checks ?? [])];
    const run = { caseId: evalCase.id, title: evalCase.title, results, checks: allChecks, pass: allChecks.every((c) => c.pass), judgments: judged?.judgments };
    runs.push(run);
    process.stdout.write(`${run.pass ? "." : "F"}`);
  }

  const pricedModel = saved ? (saved.label.startsWith("remote") ? null : baseModel(saved.label)) : url ? null : deps.agentModel.modelId;
  const pricing = pricedModel ? await fetchPricing(pricedModel) : null;
  const metrics = softMetrics(runs, pricing);
  printReport(runs, metrics, `${label}${repeat > 1 ? ` · ${repeat} runs/case` : ""}`);
  printJudgeReport(runs, selfTest, judge?.modelId ?? null);
  printFloodReview(context);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = join("evals", "results");
  mkdirSync(outDir, { recursive: true });
  const fileBase = join(outDir, `${stamp}-${label.replace(/[^a-z0-9.-]+/gi, "_")}`);
  const markdown = markdownSummary(runs, metrics, {
    label,
    date: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC",
    repeat,
    judgeModel: judge?.modelId ?? null,
    selfTest,
  });
  writeFileSync(`${fileBase}.json`, JSON.stringify({ label, repeat, metrics, judge: judge?.modelId ?? null, selfTest, runs }, null, 2));
  writeFileSync(`${fileBase}.md`, markdown);
  if (has("publish")) writeFileSync(join("docs", "evals.md"), markdown);
  console.log(`\nReport: ${fileBase}.md${has("publish") ? " (+ docs/evals.md)" : ""}`);

  const failed = runs.filter((r) => !r.pass);
  await recordEvent({
    eventType: "eval.finished",
    source: "eval",
    level: failed.length ? "warn" : "info",
    message: `${runs.length - failed.length}/${runs.length} runs passed on ${label}`,
    payload: {
      label,
      repeat,
      failedCases: [...new Set(failed.map((r) => r.caseId))],
      avgToolCalls: metrics.avgToolCalls,
      costUsd: metrics.costUsd,
      judge: judge?.modelId ?? null,
      judgeSelfTest: selfTest ? `${selfTest.correct}/${selfTest.total}` : null,
    },
  });
  if (failed.length) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
