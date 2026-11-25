/**
 * @module evals/lib/report
 *
 * Soft metrics (E4), the terminal table and the Markdown summary (E6), and the
 * flood side-by-side for the D57 review (E7).
 */
import type { AgentContext } from "../../src/core/agent/context";
import { EXTERNAL_HTTP_TIMEOUT_MS } from "../../src/core/config/timeouts";
import { boundaryLogLine } from "../../src/core/errors/boundaryError";
import { isInconsistentVerdict } from "../../src/core/judge/judgeAnswer";
import { percentile } from "../../src/core/utils/stats";
import { duplicateCalls } from "./checks";
import { fixed as f, groupBy } from "./helpers";
import type { JudgeSelfTest } from "./judging";
import type { CaseRun, ResultsFile } from "./types";

/** Price per token, from OpenRouter's public model list (null when unknown). */
export interface Pricing {
  input: number;
  output: number;
}

/** OpenRouter's public model list. */
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

/**
 * Looks up a model's current price on OpenRouter (public endpoint, no key). The cost is a soft
 * metric, so a failure is logged and the run goes on without a price.
 * @param modelId - OpenRouter model id.
 * @returns per-token prices, or null when unavailable.
 */
export async function fetchPricing(modelId: string): Promise<Pricing | null> {
  try {
    const res = await fetch(OPENROUTER_MODELS_URL, { signal: AbortSignal.timeout(EXTERNAL_HTTP_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`OpenRouter model list answered HTTP ${res.status}`);
    const json = (await res.json()) as { data?: { id: string; pricing: { prompt: string; completion: string } }[] };
    const model = json.data?.find((m) => m.id === modelId);
    if (!model) console.warn(`💸 No OpenRouter price listed for ${modelId}; cost will show as n/a.`);
    return model ? { input: Number(model.pricing.prompt), output: Number(model.pricing.completion) } : null;
  } catch (error) {
    console.warn(`${boundaryLogLine(error, "fetchPricing", "llm")} (continuing without a price)`);
    return null;
  }
}

/**
 * Whether the judge can be trusted on these runs (J4, D109): it graded every planted answer
 * right AND never contradicted itself. The one definition used by the CLI report, the app's
 * run summary and the bakeoff.
 * @param selfTest - the self-test (`caught` in files from before D109), or null/undefined without one.
 * @param runs - the judged case runs.
 * @returns true when its verdicts can be trusted.
 */
export function isJudgeReliable(selfTest: ResultsFile["selfTest"], runs: CaseRun[]): boolean {
  if (!selfTest) return false;
  return (selfTest.correct ?? selfTest.caught) === selfTest.total && (judgeAverages(runs)?.inconsistent ?? 0) === 0;
}

/** Soft metrics for a set of runs. */
export interface SoftMetrics {
  turns: number;
  /** Turns that produced an answer. */
  answered: number;
  /** Whether any turn reported token usage (in-process runs do; the remote stream doesn't). */
  usageReported: boolean;
  avgToolCalls: number;
  duplicateCalls: number;
  untracedNumbers: number;
  retries: number;
  avgSeconds: number;
  p95Seconds: number;
  inputTokens: number;
  outputTokens: number;
  /** Input tokens served from the provider's prompt cache (D136). */
  cachedInputTokens: number;
  /** USD: what OpenRouter charged when every turn reported it, else estimated from list prices; null when unknown. */
  costUsd: number | null;
  /** Where `costUsd` comes from. */
  costSource: "charged" | "estimated" | null;
}

/**
 * Computes the soft metrics over all turns of all runs.
 * @param runs - case runs.
 * @param pricing - per-token prices (or null).
 * @returns the metrics.
 */
export function softMetrics(runs: CaseRun[], pricing: Pricing | null): SoftMetrics {
  const turns = runs.flatMap((r) => r.results);
  const answers = turns.map((t) => t.answer).filter((a) => a !== null);
  const seconds = turns.map((t) => t.ms / 1000);
  const inputTokens = turns.reduce((s, t) => s + (t.usage?.inputTokens ?? 0), 0);
  const outputTokens = turns.reduce((s, t) => s + (t.usage?.outputTokens ?? 0), 0);
  const hasUsage = turns.some((t) => t.usage);
  const cachedInputTokens = turns.reduce((s, t) => s + (t.usage?.cachedInputTokens ?? 0), 0);
  // The charged cost is exact: use it when every turn with usage reported one (D136).
  const withUsage = turns.filter((t) => t.usage);
  const charged = withUsage.length > 0 && withUsage.every((t) => typeof t.usage?.costUsd === "number");
  const estimated = pricing && hasUsage ? inputTokens * pricing.input + outputTokens * pricing.output : null;
  return {
    turns: turns.length,
    answered: answers.length,
    usageReported: hasUsage,
    avgToolCalls: answers.length ? answers.reduce((s, a) => s + a.meta.toolCalls.length, 0) / answers.length : 0,
    duplicateCalls: answers.reduce((s, a) => s + duplicateCalls(a.meta.toolCalls), 0),
    untracedNumbers: answers.reduce((s, a) => s + a.meta.warnings.length, 0),
    retries: answers.filter((a) => a.meta.retried).length,
    avgSeconds: seconds.reduce((s, x) => s + x, 0) / Math.max(1, seconds.length),
    p95Seconds: seconds.length ? percentile(seconds, 0.95) : 0,
    inputTokens,
    outputTokens,
    cachedInputTokens,
    costUsd: charged ? withUsage.reduce((s, t) => s + (t.usage?.costUsd ?? 0), 0) : estimated,
    costSource: charged ? "charged" : estimated !== null ? "estimated" : null,
  };
}

/**
 * The cost as text, saying whether OpenRouter charged it or it's estimated from list prices.
 * @param metrics - soft metrics.
 * @returns e.g. "$0.142 charged by OpenRouter" or "≈ $0.146 estimated from list prices".
 */
function costText(metrics: SoftMetrics): string {
  const amount = `$${f(metrics.costUsd ?? 0, 3)}`;
  return metrics.costSource === "charged" ? `${amount} charged by OpenRouter` : `≈ ${amount} estimated from list prices`;
}

/**
 * Token counts as text, or why there are none: every turn failed (a failed turn reports no usage),
 * or a remote run (`--url`), whose streamed API doesn't carry usage.
 * @param metrics - soft metrics.
 * @returns "in / out", or a plain "n/a" explanation.
 */
function tokensText(metrics: SoftMetrics): string {
  if (metrics.usageReported) {
    const cachedShare = metrics.inputTokens ? Math.round((metrics.cachedInputTokens / metrics.inputTokens) * 100) : 0;
    return `${metrics.inputTokens.toLocaleString()} in (${metrics.cachedInputTokens.toLocaleString()} from the prompt cache, ${cachedShare}%) / ${metrics.outputTokens.toLocaleString()} out`;
  }
  if (metrics.turns > 0 && metrics.answered === 0) return "n/a (every turn failed, so no tokens were counted)";
  return "n/a (remote run: the API stream doesn't report tokens)";
}

/**
 * Prints the per-case table and the totals to the terminal.
 * @param runs - case runs.
 * @param metrics - soft metrics.
 * @param label - model / target label.
 */
export function printReport(runs: CaseRun[], metrics: SoftMetrics, label: string): void {
  console.log(`\n🔮 Sneakoscope evals — ${label}\n`);
  for (const run of runs) {
    const answers = run.results.map((r) => r.answer).filter((a) => a !== null);
    const tools = answers.reduce((s, a) => s + a.meta.toolCalls.length, 0);
    const dupes = answers.reduce((s, a) => s + duplicateCalls(a.meta.toolCalls), 0);
    const secs = run.results.reduce((s, r) => s + r.ms, 0) / 1000;
    console.log(`${run.pass ? "✅" : "❌"} ${run.caseId.padEnd(22)} ${run.title.padEnd(48)} tools ${tools}${dupes ? ` (${dupes} dup)` : ""} · ${f(secs)}s`);
    for (const c of run.checks.filter((c) => !c.pass)) console.log(`     ✗ ${c.name}: ${c.detail}`);
  }
  const passed = runs.filter((r) => r.pass).length;
  console.log(`\n${passed === runs.length ? "🏆" : "⚠️ "} ${passed}/${runs.length} cases passed`);
  console.log(
    `   avg ${f(metrics.avgToolCalls)} tool calls · ${metrics.duplicateCalls} duplicate calls · ${metrics.untracedNumbers} untraced numbers · ` +
      `${metrics.retries} retries · avg ${f(metrics.avgSeconds)}s (p95 ${f(metrics.p95Seconds)}s) · ` +
      `tokens ${tokensText(metrics)}` +
      (metrics.costUsd !== null ? ` · ${costText(metrics)}` : ""),
  );
}

/** Average judge scores over all judged turns (J3 soft metrics). */
export interface JudgeAverages {
  judged: number;
  faithfulToData: number;
  answersQuestion: number;
  honestAboutLimits: number;
  premiseHandling: number | null;
  clarity: number;
  /** Answers the judge gave a "pass" verdict (soft, J5). */
  passVerdicts: number;
  /** Claims about our data the judge found unsupported. */
  unsupportedClaims: number;
  /** Widely known context, allowed but listed (J6). */
  generalKnowledgeClaims: number;
  /** Verdicts that contradict themselves (D109): a sign the judge is broken. */
  inconsistent: number;
}

/**
 * Averages the judge's scores across every judged turn.
 * @param runs - case runs with judgments.
 * @returns averages, or null when nothing was judged.
 */
export function judgeAverages(runs: CaseRun[]): JudgeAverages | null {
  const verdicts = runs.flatMap((r) => r.judgments ?? []).map((j) => j.verdict).filter((v) => v !== null);
  if (verdicts.length === 0) return null;
  /**
   * The mean of one score over the verdicts that have it.
   * @param pick - reads the score from a verdict (null = not graded, e.g. no premise).
   * @returns the mean, or null when no verdict has the score.
   */
  const avg =(pick: (v: (typeof verdicts)[number]) => number | null) => {
    const values = verdicts.map(pick).filter((x): x is number => x !== null);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  };
  return {
    judged: verdicts.length,
    faithfulToData: avg((v) => v.faithfulToData)!,
    answersQuestion: avg((v) => v.answersQuestion)!,
    honestAboutLimits: avg((v) => v.honestAboutLimits)!,
    premiseHandling: avg((v) => v.premiseHandling),
    clarity: avg((v) => v.clarity)!,
    passVerdicts: verdicts.filter((v) => v.verdict === "pass").length,
    unsupportedClaims: verdicts.reduce((s, v) => s + v.unsupportedClaims.length, 0),
    generalKnowledgeClaims: verdicts.reduce((s, v) => s + v.generalKnowledgeClaims.length, 0),
    inconsistent: verdicts.filter(isInconsistentVerdict).length,
  };
}

/**
 * Prints the judge's average scores and the self-test (J3, J4).
 * @param runs - case runs.
 * @param selfTest - the self-test result (null when the judge is off).
 * @param judgeModel - judge model id (null when off).
 */
export function printJudgeReport(runs: CaseRun[], selfTest: JudgeSelfTest | null, judgeModel: string | null): void {
  if (!judgeModel) return console.log("\n⚖️  Judge: off (--no-judge)");
  const a = judgeAverages(runs);
  const reliable = isJudgeReliable(selfTest, runs);
  console.log(`\n⚖️  Judge (${judgeModel}) — self-test: ${selfTest ? `${selfTest.correct}/${selfTest.total} planted answers graded right` : "n/a"}${reliable ? " ✅" : " ⚠️  JUDGE UNRELIABLE — don't trust its verdicts"}`);
  for (const d of selfTest?.details ?? []) console.log(`   · ${d}`);
  if (a) {
    console.log(
      `   avg over ${a.judged} answers (1–5): faithful ${f(a.faithfulToData)} · answers question ${f(a.answersQuestion)} · ` +
        `honest about limits ${f(a.honestAboutLimits)} · premise ${a.premiseHandling === null ? "n/a" : f(a.premiseHandling)} · clarity ${f(a.clarity)}`,
    );
    console.log(
      `   "pass" verdicts ${a.passVerdicts}/${a.judged} (soft) · ${a.unsupportedClaims} unsupported claims · ${a.generalKnowledgeClaims} general-knowledge claims (allowed)` +
        (a.inconsistent ? ` · ⚠️  ${a.inconsistent} self-contradicting verdicts` : ""),
    );
    for (const run of runs) {
      for (const j of run.judgments ?? []) {
        for (const claim of j.verdict?.unsupportedClaims ?? []) console.log(`   ⚑ ${run.caseId}: ${claim}`);
      }
    }
  }
}

/**
 * Builds the Markdown summary committed as docs/evals.md (E6).
 * @param runs - case runs.
 * @param metrics - soft metrics.
 * @param meta - model, mode, date, repeat count.
 * @returns Markdown.
 */
export function markdownSummary(
  runs: CaseRun[],
  metrics: SoftMetrics,
  meta: { label: string; date: string; repeat: number; judgeModel: string | null; selfTest: JudgeSelfTest | null },
): string {
  const byCase = groupBy(runs, (run) => run.caseId);
  const rows = [...byCase.values()].map((caseRuns) => {
    const passes = caseRuns.filter((r) => r.pass).length;
    const failed = caseRuns.flatMap((r) => r.checks.filter((c) => !c.pass).map((c) => c.name));
    return `| ${caseRuns[0].caseId} | ${caseRuns[0].title} | ${passes === caseRuns.length ? "✅" : "❌"} ${passes}/${caseRuns.length} | ${[...new Set(failed)].join("; ") || "—"} |`;
  });
  const passedCases = [...byCase.values()].filter((rs) => rs.every((r) => r.pass)).length;
  return `# Eval results

Latest run: **${meta.label}** · ${meta.date} · ${meta.repeat} run(s) per case.
Run it yourself: \`npm run eval\` (see [README](../README.md)). Expected values are computed from the live data at run time.

**${passedCases}/${byCase.size} cases passed** (a case passes only if every run passed).

| Case | What it checks | Result | Failed checks |
|---|---|---|---|
${rows.join("\n")}

## Soft metrics (not pass/fail)
| Metric | Value |
|---|---|
| Avg tool calls per answer | ${f(metrics.avgToolCalls)} |
| Duplicate tool calls (total) | ${metrics.duplicateCalls} |
| Numbers in text not traced to tools | ${metrics.untracedNumbers} |
| Answers that needed a validation retry | ${metrics.retries} |
| Avg / p95 seconds per answer | ${f(metrics.avgSeconds)} / ${f(metrics.p95Seconds)} |
| Tokens (in / out) | ${tokensText(metrics)} |
| Cost | ${metrics.costUsd !== null ? costText(metrics) : "n/a"} |
${judgeSection(runs, meta.judgeModel, meta.selfTest)}`;
}

/**
 * The judge section of the Markdown summary.
 * @param runs - case runs with judgments.
 * @param judgeModel - judge model id (null when the judge was off).
 * @param selfTest - the judge's self-test (null when off).
 * @returns the Markdown section.
 */
function judgeSection(runs: CaseRun[], judgeModel: string | null, selfTest: JudgeSelfTest | null): string {
  if (!judgeModel) return "\n## Independent judge\nNot run (`--no-judge`).\n";
  const a = judgeAverages(runs);
  const reliable = isJudgeReliable(selfTest, runs);
  const flagged = runs.flatMap((r) =>
    (r.judgments ?? []).flatMap((j) => (j.verdict?.unsupportedClaims ?? []).map((claim) => `- \`${r.caseId}\`: ${claim.replace(/\|/g, "\\|")}`)),
  );
  return `
## Independent judge
Each answer is graded by **${judgeModel}** (a different provider than the answering model) against the actual tool results.
Hard check: faithful to data ≥ 4 (included in the results above). Everything else here is a soft metric:
graded twice on identical answers, the pass/fail verdict wasn't stable, so it can't fail a case on its own (D103).

**Judge self-test:** ${selfTest ? `${selfTest.correct}/${selfTest.total} planted answers graded right` : "n/a"} ${reliable ? "✅ — the judge's verdicts can be trusted" : "⚠️ — the judge misgraded a planted answer or contradicted itself, treat its verdicts with caution"}
${(selfTest?.details ?? []).map((d) => `- ${d}`).join("\n")}
${
  a
    ? `
| Average score (1–5) over ${a.judged} answers | |
|---|---|
| Faithful to data | ${f(a.faithfulToData)} |
| Answers the question | ${f(a.answersQuestion)} |
| Honest about limits | ${f(a.honestAboutLimits)} |
| Premise handling (when there was one) | ${a.premiseHandling === null ? "n/a" : f(a.premiseHandling)} |
| Clarity | ${f(a.clarity)} |
| "Pass" verdicts | ${a.passVerdicts}/${a.judged} |
| Unsupported claims about our data | ${a.unsupportedClaims} |
| General-knowledge claims (allowed, D104) | ${a.generalKnowledgeClaims} |
| Self-contradicting verdicts (D109) | ${a.inconsistent} |
`
    : ""
}${flagged.length ? `\n**Claims the judge flagged as unsupported** (to review, not all are errors):\n${flagged.join("\n")}\n` : ""}`;
}

/**
 * Prints the flood top 10 with both halves side by side, for the D57 review (E7).
 * @param ctx - agent context (latest snapshots).
 */
export function printFloodReview(ctx: AgentContext): void {
  const rows = [...ctx.snapshotByHub.values()]
    .map((s) => {
      const flood = s.hazards.flood;
      const input = (signal: string) => flood.inputs.find((i) => i.signal === signal)?.value;
      return {
        hub: ctx.hubById.get(s.hubId)!.name,
        score: flood.score,
        observed: flood.observedScore,
        fema: flood.femaScore,
        rainDays: input("heavyRainDays"),
        inland: input("inlandFloodPer1000SqMi"),
        coastal: input("coastalFlood"),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  /**
   * A signal value with 2 decimals, or "—" when the hub doesn't have it (never a made-up 0.00).
   * @param v - the signal value.
   * @returns the text.
   */
  const signalText = (v: number | null | undefined) => (v === null || v === undefined ? "—" : f(v, 2));
  console.log("\n🌊 Flood review (D57, D123) — top 10 by flood score");
  console.log("   hub              score  observed  FEMA   heavy-rain d/yr  inland /1k sq mi  coastal ev/yr");
  for (const r of rows) {
    console.log(
      `   ${r.hub.padEnd(16)} ${f(r.score).padStart(5)}  ${String(r.observed ?? "—").padStart(8)}  ${String(r.fema ?? "—").padStart(5)}` +
        `   ${signalText(r.rainDays).padStart(14)}  ${signalText(r.inland).padStart(14)}${(r.coastal === null || r.coastal === undefined ? "n/a" : f(r.coastal, 2)).padStart(13)}`,
    );
  }
}
