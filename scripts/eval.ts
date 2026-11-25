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
 *   npm run eval -- --publish                 also write docs/evals.md (full in-process runs only)
 *   npm run eval -- --no-judge                skip the independent judge (J1–J4)
 *   npm run eval -- --rejudge=evals/results/<file>.json   re-check + re-judge saved answers, no agent calls (J8)
 *                                             (--case filters the saved runs; the repeat count comes from the file)
 *
 * Exit code 1 when any case fails. A JSON + Markdown report is saved in evals/results/.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createAnswerQuestionDeps } from "../src/core/agent/createAnswerQuestionDeps";
import { getCronEnv } from "../src/core/config/env";
import { recordEvent } from "../src/core/db/eventsRepository";
import type { Json } from "../src/core/db/database.types";
import { createJudgeModel } from "../src/core/judge/judgeAnswer";
import { EVAL_CASES } from "../evals/cases";
import { baseModel } from "../evals/lib/bakeoff";
import { checkKind } from "../evals/lib/checks";
import { installStrayAbortGuard } from "../evals/lib/guards";
import { utcMinuteStamp } from "../evals/lib/helpers";
import { judgeSelfTest } from "../evals/lib/judging";
import { buildOracle, dataDifferences, dataStamp } from "../evals/lib/oracle";
import { fetchPricing, markdownSummary, printFloodReview, printJudgeReport, printReport, softMetrics } from "../evals/lib/report";
import { runOneCase } from "../evals/lib/runCase";
import { runInProcess, runRemote } from "../evals/lib/runners";
import { evalRunSummary } from "../evals/lib/suite";
import type { CaseRun, CheckResult, EvalCase, ResultsFile, TurnResult } from "../evals/lib/types";
import { flag, has, intFlag, UsageError } from "./lib/cli";
import { loadResultsFile } from "./lib/results";
import { runScript } from "./lib/run";

/**
 * Finds an eval case by id.
 * @param id - case id.
 * @returns the case.
 * @throws Error when a saved run's case no longer exists.
 */
function findCase(id: string): EvalCase {
  const found = EVAL_CASES.find((c) => c.id === id);
  if (!found) throw new Error(`Saved case "${id}" no longer exists in evals/cases.ts.`);
  return found;
}

/**
 * The OpenRouter provider of a model id ("openai/gpt-6.1-terra" → "openai").
 * @param modelId - an OpenRouter model id.
 * @returns the provider part.
 */
const provider = (modelId: string) => modelId.split("/")[0];

/**
 * A case whose number checks keep the saved run's results: used by --rejudge when today's data
 * differs from the data the saved answers were made with, so they aren't compared to new values.
 * Every other check is re-run as usual.
 * @param evalCase - the case.
 * @param savedChecks - the saved run's checks.
 * @returns the case with the adjusted check.
 */
function withSavedGateChecks(evalCase: EvalCase, savedChecks: CheckResult[]): EvalCase {
  return {
    ...evalCase,
    check: async (results, oracle) => [
      ...(await evalCase.check(results, oracle)).filter((c) => checkKind(c) !== "gate"),
      ...savedChecks
        .filter((c) => checkKind(c) === "gate")
        .map((c): CheckResult => ({ ...c, kind: "gate", detail: `${c.detail} (kept from the original run: the data changed since)` })),
    ],
  };
}

/** Runs the evals. */
async function main(): Promise<void> {
  installStrayAbortGuard();
  const startedAt = Date.now();
  const url = flag("url");
  const rejudgeFile = flag("rejudge");
  const only = flag("case")?.split(",").map((s) => s.trim()).filter(Boolean);
  const publish = has("publish");
  if (publish && (url || rejudgeFile || only)) {
    throw new UsageError("--publish only writes docs/evals.md for a full in-process run (no --case, --url or --rejudge), so the published page always describes the whole eval set.");
  }
  const saved = rejudgeFile ? loadResultsFile(rejudgeFile) : null;
  if (saved && flag("repeat") !== undefined) console.warn("⚠️  --repeat is ignored with --rejudge: the repeat count comes from the saved file.");
  const repeat = saved ? (saved.repeat ?? 1) : intFlag("repeat", 1);
  const cases = only ? EVAL_CASES.filter((c) => only.includes(c.id)) : EVAL_CASES;
  if (cases.length === 0) throw new UsageError(`No cases match --case=${only?.join(",")}. Known: ${EVAL_CASES.map((c) => c.id).join(", ")}`);

  // The oracle always reads the same data the agent sees (local DB access needed even in --url mode).
  const deps = createAnswerQuestionDeps({ modelOverride: flag("model") });
  const context = await deps.loadContext({ today: deps.today(), units: "us" });
  const oracle = buildOracle(context);
  const currentData = dataStamp(context);
  // Read the operator key once, before any slow work, so a missing CRON_SECRET fails fast.
  const operatorKey = url ? getCronEnv().CRON_SECRET : null;
  const liveLabel = url ? `remote ${url}` : deps.agentModel.modelId;

  const judge = has("no-judge") ? null : createJudgeModel();
  const answering = saved ? baseModel(saved.label) : url ? null : deps.agentModel.modelId;
  if (judge && answering && provider(judge.modelId) === provider(answering)) {
    console.warn(`⚠️  The judge (${judge.modelId}) and the answering model (${answering}) share a provider; judges can favor their own family (D100, D111).`);
  }

  // --rejudge: the saved answers were made with some data; number checks only make sense against the same data.
  const savedRuns = saved ? saved.runs.filter((run) => !only || only.includes(run.caseId)) : [];
  const changed = saved?.data ? dataDifferences(saved.data, currentData) : [];
  if (saved && !saved.data) console.warn("⚠️  This results file doesn't say which data it was made with (older format): number checks compare its answers with TODAY's data.");
  if (changed.length) console.warn(`⚠️  The data changed since this run (${changed.join("; ")}): number checks keep their saved results instead of comparing with today's values.`);
  if (saved && savedRuns.length === 0) throw new UsageError(`No saved runs in ${rejudgeFile} match --case=${only?.join(",")}.`);

  const label = saved ? `${saved.label} (rejudged)` : liveLabel;
  console.log(
    saved
      ? `Re-checking ${savedRuns.length} saved run(s) from ${rejudgeFile}${judge ? `, judged by ${judge.modelId}` : ""}…`
      : `Running ${cases.length} case(s) × ${repeat} on ${label}${judge ? `, judged by ${judge.modelId}` : ""}…`,
  );
  const selfTest = judge ? await judgeSelfTest(context, judge) : null;
  // Each job yields one case's turn results: saved answers (--rejudge, no agent calls) or a fresh run.
  const jobs: { evalCase: EvalCase; getResults: () => Promise<TurnResult[]> }[] = saved
    ? savedRuns.map((run) => {
        const evalCase = findCase(run.caseId);
        return { evalCase: changed.length ? withSavedGateChecks(evalCase, run.checks) : evalCase, getResults: async () => run.results };
      })
    : Array.from({ length: repeat }, () => cases).flat().map((evalCase) => ({
        evalCase,
        getResults: () => (url && operatorKey !== null ? runRemote(evalCase, { baseUrl: url, operatorKey }) : runInProcess(evalCase, deps.agentModel, context)),
      }));
  const runs: CaseRun[] = [];
  for (const { evalCase, getResults } of jobs) {
    const run = await runOneCase(evalCase, getResults, { oracle, judge, context });
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
  const markdown = markdownSummary(runs, metrics, { label, date: utcMinuteStamp(), repeat, judgeModel: judge?.modelId ?? null, selfTest });
  // `data`: what the checks were graded against (a rejudged file keeps its answers' data when it is known).
  const results: ResultsFile = { label, repeat, metrics, judge: judge?.modelId ?? null, selfTest, data: saved?.data ?? currentData, runs };
  writeFileSync(`${fileBase}.json`, JSON.stringify(results, null, 2));
  writeFileSync(`${fileBase}.md`, markdown);
  if (publish) writeFileSync(join("docs", "evals.md"), markdown);
  console.log(`\nReport: ${fileBase}.md${publish ? " (+ docs/evals.md)" : ""}`);

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
      // The same summary the app saves, so the "Answer quality" card shows CLI runs too (D130).
      // Saved only for a single, live, in-process run of the WHOLE set: that's what the card describes
      // (a --case subset would show e.g. "2/2 passed" as if it were the full eval).
      summary:
        repeat === 1 && !url && !saved && !only
          ? (evalRunSummary(runs, { model: label, trigger: "cli", judge: judge?.modelId ?? null, selfTest, seconds: (Date.now() - startedAt) / 1000 }) as unknown as Json)
          : null,
    },
  });
  if (failed.length) process.exitCode = 1;
}

void runScript(main, "scripts/eval");
