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
import { boundaryLogLine, describeUnknownError } from "../../src/core/errors/boundaryError";
import type { JudgeModel } from "../../src/core/judge/judgeAnswer";
import { EVAL_CASES } from "../cases";
import { judgeSelfTest, type JudgeSelfTest } from "./judging";
import { buildOracle } from "./oracle";
import { isJudgeReliable } from "./report";
import { CASE_CRASHED, failedCaseRun, runOneCase } from "./runCase";
import { runInProcess } from "./runners";
import type { CaseRun, EvalCase } from "./types";

/** Name of the check on a case that never started because the run's deadline passed. */
export const OUT_OF_TIME = "skipped: out of time";

/** Who started a run. */
export type EvalTrigger = "ui" | "cli";

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
  trigger: EvalTrigger;
  passed: number;
  total: number;
  /** The judge model, or null when the run had no judge. */
  judge: string | null;
  /** Whether the judge can be trusted (`isJudgeReliable`: all planted answers right, no self-contradiction; null without a judge). */
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
  meta: { model: string; trigger: EvalTrigger; judge: string | null; selfTest: JudgeSelfTest | null; seconds: number },
): EvalRunSummary {
  return {
    model: meta.model,
    trigger: meta.trigger,
    passed: runs.filter((r) => r.pass).length,
    total: runs.length,
    judge: meta.judge,
    judgeReliable: meta.judge ? isJudgeReliable(meta.selfTest, runs) : null,
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
  /** The answering model. */
  agent: AgentModel;
  /** The data the agent and the oracle read. */
  context: AgentContext;
  /** The independent judge, or null (code checks only). */
  judge: JudgeModel | null;
  /** Cases run at the same time (default 3). */
  concurrency?: number;
  /** Called for each progress event. */
  onEvent: (event: SuiteEvent) => void;
  /** The cases to run (default: the whole eval set). */
  cases?: EvalCase[];
  /**
   * Time budget in ms from the start of the run. After it, no NEW case is started: the cases not
   * started are reported as failed ("skipped: out of time"), so a partial summary is still saved
   * before the platform's time limit. Cases already running finish. Default: no deadline.
   */
  deadlineMs?: number;
  /** Who started the run (default "ui", the app's button). */
  trigger?: EvalTrigger;
}

/**
 * Sends one progress event; a failing listener is logged and never stops the run.
 * @param onEvent - the listener.
 * @param event - the event.
 */
function emit(onEvent: SuiteOptions["onEvent"], event: SuiteEvent): void {
  try {
    onEvent(event);
  } catch (error) {
    console.error(`${boundaryLogLine(error, "runEvalSuite.emit", "script")} (progress event dropped, the run goes on)`);
  }
}

/**
 * Runs the eval set once. One failing case (or worker) never loses the others: every case ends
 * up in the summary, as passed, failed, crashed or skipped for time.
 * @param options - agent, data, judge, concurrency, deadline, trigger, progress callback.
 * @returns the case runs and the summary.
 */
export async function runEvalSuite(options: SuiteOptions): Promise<{ runs: CaseRun[]; summary: EvalRunSummary }> {
  const started = Date.now();
  const cases = options.cases ?? EVAL_CASES;
  const oracle = buildOracle(options.context);
  emit(options.onEvent, {
    type: "start",
    total: cases.length,
    model: options.agent.modelId,
    judge: options.judge?.modelId ?? null,
    cases: cases.map((c) => ({ caseId: c.id, title: c.title })),
  });

  const selfTest = options.judge ? await judgeSelfTest(options.context, options.judge) : null;
  if (selfTest) emit(options.onEvent, { type: "selftest", correct: selfTest.correct, total: selfTest.total });

  const runs: (CaseRun | undefined)[] = new Array(cases.length);
  /**
   * Whether the run's time budget is used up.
   * @returns true once `deadlineMs` has passed since the start (never without a deadline).
   */
  const outOfTime = () => options.deadlineMs !== undefined && Date.now() - started >= options.deadlineMs;
  let next = 0;
  /**
   * Takes the next case until none are left or the deadline has passed, and records each run.
   * `runOneCase` never throws, so a worker only stops early if recording a run itself fails.
   */
  const worker = async (): Promise<void> => {
    while (next < cases.length && !outOfTime()) {
      const index = next++;
      const run = await runOneCase(cases[index], () => runInProcess(cases[index], options.agent, options.context), { oracle, judge: options.judge, context: options.context });
      runs[index] = run;
      emit(options.onEvent, { type: "case", outcome: caseOutcome(run) });
    }
  };
  const workers = await Promise.allSettled(Array.from({ length: Math.max(1, Math.min(options.concurrency ?? 3, cases.length)) }, worker));
  const workerError = workers.find((w): w is PromiseRejectedResult => w.status === "rejected")?.reason;
  if (workerError !== undefined) console.error(`${boundaryLogLine(workerError, "runEvalSuite.worker", "script")} (its unfinished cases are marked failed)`);

  // Cases never run: not handed out because the deadline passed, or lost with failed workers.
  // Report them, don't drop them.
  const finished: CaseRun[] = cases.map((evalCase, index) => {
    const run = runs[index];
    if (run) return run;
    const missing =
      index >= next && outOfTime()
        ? failedCaseRun(evalCase, OUT_OF_TIME, `not started: the run's ${Math.round((options.deadlineMs ?? 0) / 1000)} s time budget was used up`)
        : failedCaseRun(evalCase, CASE_CRASHED, `the case's worker failed: ${describeUnknownError(workerError)}`);
    emit(options.onEvent, { type: "case", outcome: caseOutcome(missing) });
    return missing;
  });

  const summary = evalRunSummary(finished, {
    model: options.agent.modelId,
    trigger: options.trigger ?? "ui",
    judge: options.judge?.modelId ?? null,
    selfTest,
    seconds: (Date.now() - started) / 1000,
  });
  emit(options.onEvent, { type: "done", summary });
  return { runs: finished, summary };
}
