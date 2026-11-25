/**
 * @module evals/lib/bakeoff
 *
 * Pools saved eval runs per model and ranks models by the agreed rule (B4, D107):
 * 1) gate: zero failures on premise/data checks and p95 ≤ 30 s;
 * 2) accuracy: pass rate, where within 2 case-runs of the best counts as a tie;
 * 3) cheapest per answer among the tied; 4) fastest as the final tiebreak.
 */
import { judgeAverages, softMetrics } from "./report";
import type { CaseRun } from "./types";

/** Hard UX limit on p95 seconds per answer (B4). */
export const P95_LIMIT_SECONDS = 30;

/** Case-runs within this many of the best pass count are a tie (B4: noise). */
export const TIE_BAND_RUNS = 2;

/** Check names that guard the "never wrong" promises: the premise verdict and the data (B4 gate). */
export const GATE_CHECK = /premise|matches|computed|numbers|percentage/i;

/** A saved eval results file (scripts/eval.ts output). */
export interface ResultsFile {
  label: string;
  judge: string | null;
  /** The judge's self-test (`correct`; files from before D109 have `caught`). */
  selfTest?: { correct?: number; caught?: number; total: number } | null;
  metrics: { turns: number; costUsd: number | null };
  runs: CaseRun[];
}

/**
 * The model id behind a results label ("x/y (rejudged) (rejudged)" → "x/y").
 * @param label - a results file label.
 * @returns the model id.
 */
export function baseModel(label: string): string {
  return label.replace(/( \(rejudged\))+$/, "");
}

/**
 * Whether a judge was reliable on these files (D109): every self-test fully right and no self-contradicting verdicts.
 * @param files - results graded by one judge.
 * @returns true when the judge can be trusted.
 */
export function judgeReliable(files: ResultsFile[]): boolean {
  const selfTestsOk = files.every((f) => f.selfTest && (f.selfTest.correct ?? f.selfTest.caught) === f.selfTest.total);
  return selfTestsOk && (judgeAverages(files.flatMap((f) => f.runs))?.inconsistent ?? 0) === 0;
}

/** One model's pooled results. */
export interface ModelSummary {
  model: string;
  caseRuns: number;
  passed: number;
  gateFailures: string[];
  codeFailures: number;
  judgeFailures: number;
  answers: number;
  costPerAnswer: number | null;
  avgSeconds: number;
  p95Seconds: number;
  avgToolCalls: number;
  duplicateCalls: number;
  untraced: number;
  retries: number;
  faithful: number | null;
  /** Self-contradicting judge verdicts (D109). */
  judgeInconsistent: number;
  failedCases: string[];
}

/**
 * Pools one model's files into a summary.
 * @param model - model id.
 * @param files - that model's results files.
 * @returns the summary.
 */
export function summarize(model: string, files: ResultsFile[]): ModelSummary {
  const runs = files.flatMap((f) => f.runs);
  const metrics = softMetrics(runs, null);
  // Cost per answer from the files that have a price (a re-judged file may not).
  const priced = files.filter((f) => f.metrics.costUsd !== null);
  const pricedTurns = priced.reduce((s, f) => s + f.metrics.turns, 0);
  const costPerAnswer = pricedTurns ? priced.reduce((s, f) => s + f.metrics.costUsd!, 0) / pricedTurns : null;
  const failed = runs.flatMap((r) => r.checks.filter((c) => !c.pass).map((c) => ({ caseId: r.caseId, name: c.name })));
  return {
    model,
    caseRuns: runs.length,
    passed: runs.filter((r) => r.pass).length,
    gateFailures: failed.filter((c) => !c.name.startsWith("judge:") && GATE_CHECK.test(c.name)).map((c) => `${c.caseId}: ${c.name}`),
    codeFailures: failed.filter((c) => !c.name.startsWith("judge:")).length,
    judgeFailures: failed.filter((c) => c.name.startsWith("judge:")).length,
    answers: metrics.turns,
    costPerAnswer,
    avgSeconds: metrics.avgSeconds,
    p95Seconds: metrics.p95Seconds,
    avgToolCalls: metrics.avgToolCalls,
    duplicateCalls: metrics.duplicateCalls,
    untraced: metrics.untracedNumbers,
    retries: metrics.retries,
    faithful: judgeAverages(runs)?.faithfulToData ?? null,
    judgeInconsistent: judgeAverages(runs)?.inconsistent ?? 0,
    failedCases: [...new Set(runs.filter((r) => !r.pass).map((r) => r.caseId))],
  };
}

/**
 * Orders models by the B4 rule and says why each one lands where it does.
 * @param models - model summaries.
 * @returns ranked summaries with a short verdict each.
 */
export function rankModels(models: ModelSummary[]): { summary: ModelSummary; verdict: string }[] {
  const rate = (m: ModelSummary) => m.passed / Math.max(1, m.caseRuns);
  const gated = (m: ModelSummary) => m.gateFailures.length === 0 && m.p95Seconds <= P95_LIMIT_SECONDS;
  const eligible = models.filter(gated);
  const best = Math.max(0, ...eligible.map(rate));
  const tied = (m: ModelSummary) => gated(m) && rate(m) >= best - TIE_BAND_RUNS / Math.max(1, m.caseRuns);
  const order = (a: ModelSummary, b: ModelSummary) =>
    Number(tied(b)) - Number(tied(a)) ||
    Number(gated(b)) - Number(gated(a)) ||
    (tied(a) && tied(b) ? (a.costPerAnswer ?? Infinity) - (b.costPerAnswer ?? Infinity) || a.avgSeconds - b.avgSeconds : rate(b) - rate(a));
  return [...models].sort(order).map((summary, i) => ({
    summary,
    verdict: !gated(summary)
      ? summary.gateFailures.length
        ? "❌ fails the data/premise gate"
        : `❌ p95 over ${P95_LIMIT_SECONDS}s`
      : tied(summary)
        ? i === 0
          ? "🏆 top accuracy, cheapest"
          : "tied on accuracy, costs more"
        : "less accurate",
  }));
}
