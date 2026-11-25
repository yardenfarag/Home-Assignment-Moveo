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

/**
 * What a check guards, so reports and the bakeoff gate filter on it instead of on check names:
 * - `gate`: a "never wrong" promise, the data or the premise verdict (a failure disqualifies a model in the bakeoff);
 * - `tool`: the agent called the right tool with the right input;
 * - `behavior`: what the answer does or says (answered, scope, disclaimer, wording);
 * - `judge`: the independent LLM judge's verdict;
 * - `setup`: the eval itself, not the model (the case's own assumptions still hold, a crash, out of time).
 */
export type CheckKind = "gate" | "tool" | "behavior" | "judge" | "setup";

/** One pass/fail check inside a case. */
export interface CheckResult {
  name: string;
  pass: boolean;
  /** What was expected vs what happened — shown on failure. */
  detail: string;
  /** What the check guards. Missing in results files saved before it existed: read it with `checkKind()`. */
  kind?: CheckKind;
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

/**
 * Which data a run was graded against, so `--rejudge` can tell when today's data differs from the
 * data the saved answers were made with (number checks would then compare against the wrong values).
 */
export interface DataStamp {
  /** The run's "today" (`YYYY-MM-DD`); "last year" is derived from it. */
  today: string;
  /** The scoring run behind the snapshots (null when they come from several runs). */
  scoringRunId: string | null;
  /** The scoring window of those snapshots. */
  window: { start: string; end: string } | null;
  /** The newest weather day in the database. */
  weatherLatest: string;
}

/** A results file written by `npm run eval` (evals/results/*.json). Older files lack the optional fields. */
export interface ResultsFile {
  label: string;
  /** Runs per case (missing in the oldest files: 1). */
  repeat?: number;
  judge: string | null;
  /** The judge's self-test (`correct`; files from before D109 have `caught`). */
  selfTest?: { correct?: number; caught?: number; total: number; details?: string[] } | null;
  metrics: { turns: number; costUsd: number | null };
  /** The data the answers were graded against (files from before it existed don't say). */
  data?: DataStamp;
  runs: CaseRun[];
}
