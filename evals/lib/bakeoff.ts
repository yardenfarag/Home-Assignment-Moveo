/**
 * @module evals/lib/bakeoff
 *
 * Pools saved eval runs per model and ranks models by the agreed rule (B4, D107):
 * 1) gate: zero failures on premise/data checks and p95 ≤ 30 s;
 * 2) accuracy: pass rate, where within 2 case-runs of the best counts as a tie;
 * 3) cheapest per answer among the tied; 4) fastest as the final tiebreak.
 */
import { checkKind } from "./checks";
import { isJudgeReliable, judgeAverages, softMetrics } from "./report";
import type { ResultsFile } from "./types";

/** Hard UX limit on p95 seconds per answer (B4). */
export const P95_LIMIT_SECONDS = 30;

/** Case-runs within this many of the best pass count are a tie (B4: noise). */
export const TIE_BAND_RUNS = 2;

/**
 * The model id behind a results label ("x/y (rejudged) (rejudged)" → "x/y").
 * @param label - a results file label.
 * @returns the model id.
 */
export function baseModel(label: string): string {
  return label.replace(/( \(rejudged\))+$/, "");
}

/**
 * Whether a judge was reliable on these files: reliable (`isJudgeReliable`) in every one of them.
 * @param files - results graded by one judge.
 * @returns true when the judge can be trusted.
 */
export function judgeReliable(files: ResultsFile[]): boolean {
  return files.every((f) => isJudgeReliable(f.selfTest, f.runs));
}

/** One model's pooled results. */
export interface ModelSummary {
  /** The model id. */
  model: string;
  /** Case runs pooled over all its files. */
  caseRuns: number;
  /** Case runs that passed. */
  passed: number;
  /** Failed gate checks (wrong data or premise), as "caseId: check name". */
  gateFailures: string[];
  /** Failed checks that aren't the judge's (gate, tool, behavior, setup). */
  codeFailures: number;
  /** Failed judge checks. */
  judgeFailures: number;
  /** Answered or failed turns (one per question asked). */
  answers: number;
  /** Mean USD per answer over the priced files, null when none is priced. */
  costPerAnswer: number | null;
  /** Mean seconds per answer. */
  avgSeconds: number;
  /** 95th-percentile seconds per answer. */
  p95Seconds: number;
  /** Mean tool calls per answer. */
  avgToolCalls: number;
  /** Repeated identical tool calls. */
  duplicateCalls: number;
  /** Numbers in answer texts not traced to a tool. */
  untraced: number;
  /** Answers that needed a validation retry. */
  retries: number;
  /** The judge's mean "faithful to data" score, null without judgments. */
  faithful: number | null;
  /** Self-contradicting judge verdicts (D109). */
  judgeInconsistent: number;
  /** Ids of the cases with at least one failed run. */
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
  const judged = judgeAverages(runs);
  // Cost per answer from the files that have a price (a re-judged file may not).
  const priced = files.filter((f) => f.metrics.costUsd !== null);
  const pricedTurns = priced.reduce((s, f) => s + f.metrics.turns, 0);
  const costPerAnswer = pricedTurns ? priced.reduce((s, f) => s + f.metrics.costUsd!, 0) / pricedTurns : null;
  const failed = runs.flatMap((r) => r.checks.filter((c) => !c.pass).map((c) => ({ caseId: r.caseId, name: c.name, kind: checkKind(c) })));
  return {
    model,
    caseRuns: runs.length,
    passed: runs.filter((r) => r.pass).length,
    gateFailures: failed.filter((c) => c.kind === "gate").map((c) => `${c.caseId}: ${c.name}`),
    codeFailures: failed.filter((c) => c.kind !== "judge").length,
    judgeFailures: failed.filter((c) => c.kind === "judge").length,
    answers: metrics.turns,
    costPerAnswer,
    avgSeconds: metrics.avgSeconds,
    p95Seconds: metrics.p95Seconds,
    avgToolCalls: metrics.avgToolCalls,
    duplicateCalls: metrics.duplicateCalls,
    untraced: metrics.untracedNumbers,
    retries: metrics.retries,
    faithful: judged?.faithfulToData ?? null,
    judgeInconsistent: judged?.inconsistent ?? 0,
    failedCases: [...new Set(runs.filter((r) => !r.pass).map((r) => r.caseId))],
  };
}

/**
 * Orders models by the B4 rule and says why each one lands where it does.
 * @param models - model summaries.
 * @returns ranked summaries with a short verdict each.
 */
export function rankModels(models: ModelSummary[]): { summary: ModelSummary; verdict: string }[] {
  /**
   * A model's pass rate.
   * @param m - the model.
   * @returns passed / case runs (0 without runs).
   */
  const rate = (m: ModelSummary) => m.passed / Math.max(1, m.caseRuns);
  /**
   * Whether a model passes the gate (no wrong data/premise, p95 within the limit).
   * @param m - the model.
   * @returns true when it may be ranked on accuracy.
   */
  const gated = (m: ModelSummary) => m.gateFailures.length === 0 && m.p95Seconds <= P95_LIMIT_SECONDS;
  const eligible = models.filter(gated);
  const leader = eligible.reduce<ModelSummary | null>((best, m) => (!best || rate(m) > rate(best) ? m : best), null);
  /**
   * Whether a gated model is tied with the leader on accuracy: within TIE_BAND_RUNS case-runs of it.
   * The band is counted on the LARGER of the two pools, the same basis for both models, so a model
   * with fewer runs doesn't get a wider band.
   * @param m - the model.
   * @returns true when tied.
   */
  const tied = (m: ModelSummary) =>
    gated(m) && leader !== null && rate(m) >= rate(leader) - TIE_BAND_RUNS / Math.max(1, m.caseRuns, leader.caseRuns);
  /**
   * Sort order: tied first, then gated, then cheapest and fastest among the tied, else by pass rate.
   * @param a - one model.
   * @param b - another.
   * @returns negative when `a` ranks first.
   */
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
