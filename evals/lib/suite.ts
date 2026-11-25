/**
 * @module evals/lib/suite
 *
 * Runs the whole eval set in this process and reports each case as it finishes (Step 16, D130).
 * Used by the app's "Run evals" button (POST /api/evals/run). The run summary it builds is also
 * what the CLI saves, so the "Answer quality" card shows the latest run from either.
 *
 * Cases run a few at a time (default 3), so a full run fits in a serverless function's time limit.
 */
import type { AgentContext } from "../../src/core/agent/context";
import type { AgentModel } from "../../src/core/agent/model";
import type { JudgeModel } from "../../src/core/judge/judgeAnswer";
import { EVAL_CASES } from "../cases";
import { judgeSelfTest, judgeTurns, type JudgeSelfTest } from "./judging";
import { buildOracle } from "./oracle";
import { runInProcess } from "./runners";
import type { CaseRun, EvalCase } from "./types";

/** One case's outcome, as the card and the progress list show it. */
export interface CaseOutcome {
  caseId: string;
  title: string;
  pass: boolean;
  /** Names of the failed checks (empty when passed). */
  failed: string[];
  seconds: number;
}

/** What a finished run is remembered by (saved in the `eval.finished` event as `summary`). */
export interface EvalRunSummary {
  model: string;
  trigger: "ui" | "cli";
  passed: number;
  total: number;
  /** The judge model, or null when the run had no judge. */
  judge: string | null;
  /** Whether the judge graded all planted answers right (null without a judge). */
  judgeReliable: boolean | null;
  seconds: number;
  finishedAt: string;
  cases: CaseOutcome[];
}

/** Progress events, streamed to the browser one per line. */
export type SuiteEvent =
  | { type: "start"; total: number; model: string; judge: string | null; cases: { caseId: string; title: string }[] }
  | { type: "selftest"; correct: number; total: number }
  | { type: "case"; outcome: CaseOutcome }
  | { type: "done"; summary: EvalRunSummary };

/**
 * One case's outcome from its run.
 * @param run - the case run.
 * @returns the outcome.
 */
export function caseOutcome(run: CaseRun): CaseOutcome {
  return {
    caseId: run.caseId,
    title: run.title,
    pass: run.pass,
    failed: run.checks.filter((c) => !c.pass).map((c) => c.name),
    seconds: Math.round(run.results.reduce((s, r) => s + r.ms, 0) / 100) / 10,
  };
}

/**
 * The summary of a finished run (shared by the app and the CLI).
 * @param runs - the case runs.
 * @param meta - model, trigger, judge, self-test, duration.
 * @returns the summary.
 */
export function evalRunSummary(
  runs: CaseRun[],
  meta: { model: string; trigger: "ui" | "cli"; judge: string | null; selfTest: JudgeSelfTest | null; seconds: number },
): EvalRunSummary {
  return {
    model: meta.model,
    trigger: meta.trigger,
    passed: runs.filter((r) => r.pass).length,
    total: runs.length,
    judge: meta.judge,
    judgeReliable: meta.selfTest ? meta.selfTest.correct === meta.selfTest.total : null,
    seconds: Math.round(meta.seconds),
    finishedAt: new Date().toISOString(),
    cases: runs.map(caseOutcome),
  };
}

/**
 * Checks that a saved event payload holds a run summary (older `eval.finished` events don't).
 * @param value - the payload's `summary` field.
 * @returns true when it has the summary's shape.
 */
export function isEvalRunSummary(value: unknown): value is EvalRunSummary {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<EvalRunSummary>;
  return typeof s.model === "string" && typeof s.passed === "number" && typeof s.total === "number" && typeof s.finishedAt === "string" && Array.isArray(s.cases);
}

/**
 * The newest run summary among `eval.finished` events.
 * @param events - the events, newest first.
 * @returns the summary, or null when no event carries one.
 */
export function latestRunSummary(events: readonly { payload: unknown }[]): EvalRunSummary | null {
  for (const event of events) {
    const summary = (event.payload as { summary?: unknown } | null)?.summary;
    if (isEvalRunSummary(summary)) return summary;
  }
  return null;
}

/** What a suite run needs. */
export interface SuiteOptions {
  agent: AgentModel;
  context: AgentContext;
  judge: JudgeModel | null;
  /** Cases run at the same time. */
  concurrency?: number;
  /** Called for each progress event. */
  onEvent: (event: SuiteEvent) => void;
  cases?: EvalCase[];
}

/**
 * Runs the eval set once.
 * @param options - agent, data, judge, concurrency, progress callback.
 * @returns the case runs and the summary.
 */
export async function runEvalSuite(options: SuiteOptions): Promise<{ runs: CaseRun[]; summary: EvalRunSummary }> {
  const started = Date.now();
  const cases = options.cases ?? EVAL_CASES;
  const oracle = buildOracle(options.context);
  options.onEvent({
    type: "start",
    total: cases.length,
    model: options.agent.modelId,
    judge: options.judge?.modelId ?? null,
    cases: cases.map((c) => ({ caseId: c.id, title: c.title })),
  });

  const selfTest = options.judge ? await judgeSelfTest(options.context, options.judge) : null;
  if (selfTest) options.onEvent({ type: "selftest", correct: selfTest.correct, total: selfTest.total });

  const runs: CaseRun[] = new Array(cases.length);
  let next = 0;
  const worker = async () => {
    while (next < cases.length) {
      const index = next++;
      const evalCase = cases[index];
      const results = await runInProcess(evalCase, options.agent, options.context);
      const checks = await evalCase.check(results, oracle);
      const judged = options.judge ? await judgeTurns(results, options.judge, options.context) : null;
      const allChecks = [...checks, ...(judged?.checks ?? [])];
      const run: CaseRun = { caseId: evalCase.id, title: evalCase.title, results, checks: allChecks, pass: allChecks.every((c) => c.pass), judgments: judged?.judgments };
      runs[index] = run;
      options.onEvent({ type: "case", outcome: caseOutcome(run) });
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(options.concurrency ?? 3, cases.length)) }, worker));

  const summary = evalRunSummary(runs, {
    model: options.agent.modelId,
    trigger: "ui",
    judge: options.judge?.modelId ?? null,
    selfTest,
    seconds: (Date.now() - started) / 1000,
  });
  options.onEvent({ type: "done", summary });
  return { runs, summary };
}
