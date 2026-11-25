/**
 * @module evals/lib/types
 *
 * Shapes shared by the eval cases, runners and reporter.
 */
import type { FinalAnswer } from "../../src/core/agent/answerSchema";
import type { TurnJudgment } from "./judging";
import type { Oracle } from "./oracle";

/** What one question produced. */
export interface TurnResult {
  question: string;
  /** The validated answer, or null when the turn failed. */
  answer: FinalAnswer | null;
  /** Failure message when no answer was produced. */
  error?: string;
  /** Wall-clock time for the turn. */
  ms: number;
  /** Token usage (in-process mode only). */
  usage?: { inputTokens: number; outputTokens: number };
}

/** One pass/fail check inside a case. */
export interface CheckResult {
  name: string;
  pass: boolean;
  /** What was expected vs what happened — shown on failure. */
  detail: string;
}

/** One eval case: the questions to ask and the hard checks on the answers. */
export interface EvalCase {
  id: string;
  title: string;
  /** Questions in order (more than one = a follow-up conversation). */
  turns: string[];
  /** Hard checks; expected values come from the oracle at run time (E2), never hand-typed. */
  check: (results: TurnResult[], oracle: Oracle) => Promise<CheckResult[]> | CheckResult[];
}

/** The outcome of running one case once. */
export interface CaseRun {
  caseId: string;
  title: string;
  results: TurnResult[];
  checks: CheckResult[];
  pass: boolean;
  /** The independent judge's verdicts (absent with --no-judge). */
  judgments?: TurnJudgment[];
}
