/**
 * @module evals/lib/runCase
 *
 * Runs ONE eval case end to end (turn results → code checks → judge → `CaseRun`). Shared by
 * `npm run eval` and the app's suite, so both grade a case the same way. It never throws: a crash
 * in a case (its checks, the judge, a runner) becomes a failed run with a "case crashed" check, and
 * every other case's result is kept.
 */
import type { AgentContext } from "../../src/core/agent/context";
import { boundaryLogLine, describeUnknownError } from "../../src/core/errors/boundaryError";
import type { JudgeModel } from "../../src/core/judge/judgeAnswer";
import { check } from "./checks";
import { judgeTurns } from "./judging";
import type { Oracle } from "./oracle";
import type { CaseRun, EvalCase, TurnResult } from "./types";

/** Name of the check that marks a case whose run threw. */
export const CASE_CRASHED = "case crashed";

/** What grading a case needs. */
export interface CaseGrading {
  /** Expected values from today's data. */
  oracle: Oracle;
  /** The independent judge, or null (code checks only). */
  judge: JudgeModel | null;
  /** The agent context (the judge rebuilds the agent's system prompt from it). */
  context: AgentContext;
}

/**
 * A failed run that carries one `setup` check saying why (a crash, or no time left).
 * @param evalCase - the case.
 * @param name - the check's name, e.g. "case crashed".
 * @param detail - what happened.
 * @param results - any turn results already produced (kept for the report).
 * @returns the failed run.
 */
export function failedCaseRun(evalCase: EvalCase, name: string, detail: string, results: TurnResult[] = []): CaseRun {
  return { caseId: evalCase.id, title: evalCase.title, results, checks: [check(name, false, detail, "setup")], pass: false };
}

/**
 * Runs and grades one case. Never throws (see the module doc); a crash is logged in the boundary format.
 * @param evalCase - the case.
 * @param getResults - produces the turn results (a fresh agent run, a remote run, or saved answers).
 * @param grading - oracle, judge and context.
 * @returns the case run.
 */
export async function runOneCase(evalCase: EvalCase, getResults: () => Promise<TurnResult[]>, grading: CaseGrading): Promise<CaseRun> {
  let results: TurnResult[] = [];
  try {
    results = await getResults();
    const checks = await evalCase.check(results, grading.oracle);
    const judged = grading.judge ? await judgeTurns(results, grading.judge, grading.context) : null;
    const allChecks = [...checks, ...(judged?.checks ?? [])];
    return { caseId: evalCase.id, title: evalCase.title, results, checks: allChecks, pass: allChecks.every((c) => c.pass), judgments: judged?.judgments };
  } catch (error) {
    console.error(`${boundaryLogLine(error, `runOneCase(${evalCase.id})`, "script")} (case marked failed, the run goes on)`);
    return failedCaseRun(evalCase, CASE_CRASHED, describeUnknownError(error), results);
  }
}
