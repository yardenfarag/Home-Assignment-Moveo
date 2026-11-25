/**
 * @module evals/lib/report
 *
 * Soft metrics (E4), the terminal table and the Markdown summary (E6), and the
 * flood side-by-side for the D57 review (E7).
 */
import type { AgentContext } from "../../src/core/agent/context";
import { duplicateCalls } from "./checks";
import type { JudgeSelfTest } from "./judging";
import type { CaseRun } from "./types";

/** Price per token, from OpenRouter's public model list (null when unknown). */
export interface Pricing {
  input: number;
  output: number;
}

/**
 * Looks up a model's current price on OpenRouter (public endpoint, no key).
 * @param modelId - OpenRouter model id.
 * @returns per-token prices, or null when unavailable.
 */
export async function fetchPricing(modelId: string): Promise<Pricing | null> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(15_000) });
    const json = (await res.json()) as { data: { id: string; pricing: { prompt: string; completion: string } }[] };
    const model = json.data.find((m) => m.id === modelId);
    return model ? { input: Number(model.pricing.prompt), output: Number(model.pricing.completion) } : null;
  } catch {
    return null;
  }
}

/** Soft metrics for a set of runs. */
export interface SoftMetrics {
  turns: number;
  avgToolCalls: number;
  duplicateCalls: number;
  untracedNumbers: number;
  retries: number;
  avgSeconds: number;
  p95Seconds: number;
  inputTokens: number;
  outputTokens: number;
  /** Estimated USD, null when pricing/usage is unknown. */
  costUsd: number | null;
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
  const seconds = turns.map((t) => t.ms / 1000).sort((a, b) => a - b);
  const inputTokens = turns.reduce((s, t) => s + (t.usage?.inputTokens ?? 0), 0);
  const outputTokens = turns.reduce((s, t) => s + (t.usage?.outputTokens ?? 0), 0);
  const hasUsage = turns.some((t) => t.usage);
  return {
    turns: turns.length,
    avgToolCalls: answers.length ? answers.reduce((s, a) => s + a.meta.toolCalls.length, 0) / answers.length : 0,
    duplicateCalls: answers.reduce((s, a) => s + duplicateCalls(a.meta.toolCalls), 0),
    untracedNumbers: answers.reduce((s, a) => s + a.meta.warnings.length, 0),
    retries: answers.filter((a) => a.meta.retried).length,
    avgSeconds: seconds.reduce((s, x) => s + x, 0) / Math.max(1, seconds.length),
    p95Seconds: seconds[Math.min(seconds.length - 1, Math.floor(seconds.length * 0.95))] ?? 0,
    inputTokens,
    outputTokens,
    costUsd: pricing && hasUsage ? inputTokens * pricing.input + outputTokens * pricing.output : null,
  };
}

/** Formats a number to fixed decimals. */
const f = (n: number, d = 1) => n.toFixed(d);

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
      `${metrics.inputTokens.toLocaleString()} in / ${metrics.outputTokens.toLocaleString()} out tokens` +
      (metrics.costUsd !== null ? ` · ≈ $${f(metrics.costUsd, 3)}` : ""),
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
}

/**
 * Averages the judge's scores across every judged turn.
 * @param runs - case runs with judgments.
 * @returns averages, or null when nothing was judged.
 */
export function judgeAverages(runs: CaseRun[]): JudgeAverages | null {
  const verdicts = runs.flatMap((r) => r.judgments ?? []).map((j) => j.verdict).filter((v) => v !== null);
  if (verdicts.length === 0) return null;
  const avg = (pick: (v: (typeof verdicts)[number]) => number | null) => {
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
  const reliable = selfTest !== null && selfTest.caught === selfTest.total;
  console.log(`\n⚖️  Judge (${judgeModel}) — self-test: ${selfTest ? `${selfTest.caught}/${selfTest.total} planted bad answers caught` : "n/a"}${reliable ? " ✅" : " ⚠️  JUDGE UNRELIABLE — don't trust its verdicts"}`);
  for (const d of selfTest?.details ?? []) console.log(`   · ${d}`);
  if (a) {
    console.log(
      `   avg over ${a.judged} answers (1–5): faithful ${f(a.faithfulToData)} · answers question ${f(a.answersQuestion)} · ` +
        `honest about limits ${f(a.honestAboutLimits)} · premise ${a.premiseHandling === null ? "n/a" : f(a.premiseHandling)} · clarity ${f(a.clarity)}`,
    );
    console.log(
      `   "pass" verdicts ${a.passVerdicts}/${a.judged} (soft) · ${a.unsupportedClaims} unsupported claims · ${a.generalKnowledgeClaims} general-knowledge claims (allowed)`,
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
  const byCase = new Map<string, CaseRun[]>();
  for (const run of runs) byCase.set(run.caseId, [...(byCase.get(run.caseId) ?? []), run]);
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
| Tokens (in / out) | ${metrics.inputTokens.toLocaleString()} / ${metrics.outputTokens.toLocaleString()} |
| Estimated cost | ${metrics.costUsd !== null ? `$${f(metrics.costUsd, 3)}` : "n/a"} |
${judgeSection(runs, meta.judgeModel, meta.selfTest)}`;
}

/** The judge section of the Markdown summary. */
function judgeSection(runs: CaseRun[], judgeModel: string | null, selfTest: JudgeSelfTest | null): string {
  if (!judgeModel) return "\n## Independent judge\nNot run (`--no-judge`).\n";
  const a = judgeAverages(runs);
  const reliable = selfTest !== null && selfTest.caught === selfTest.total;
  const flagged = runs.flatMap((r) =>
    (r.judgments ?? []).flatMap((j) => (j.verdict?.unsupportedClaims ?? []).map((claim) => `- \`${r.caseId}\`: ${claim.replace(/\|/g, "\\|")}`)),
  );
  return `
## Independent judge
Each answer is graded by **${judgeModel}** (a different provider than the answering model) against the actual tool results.
Hard check: faithful to data ≥ 4 (included in the results above). Everything else here is a soft metric:
graded twice on identical answers, the pass/fail verdict flipped on 4 of 14, so it can't fail a case on its own (D103).

**Judge self-test:** ${selfTest ? `${selfTest.caught}/${selfTest.total} planted bad answers caught` : "n/a"} ${reliable ? "✅ — the judge's verdicts can be trusted" : "⚠️ — the judge missed a planted error, treat its verdicts with caution"}
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
        inland: input("inlandFlood"),
        coastal: input("coastalFlood"),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  console.log("\n🌊 Flood review (D57) — top 10 by flood score");
  console.log("   hub              score  observed  FEMA   heavy-rain d/yr  inland ev-d/yr  coastal ev/yr");
  for (const r of rows) {
    console.log(
      `   ${r.hub.padEnd(16)} ${f(r.score).padStart(5)}  ${String(r.observed ?? "—").padStart(8)}  ${String(r.fema ?? "—").padStart(5)}` +
        `   ${f(r.rainDays ?? 0, 2).padStart(14)}  ${f(r.inland ?? 0, 2).padStart(14)}  ${r.coastal === null || r.coastal === undefined ? "n/a".padStart(13) : f(r.coastal, 2).padStart(13)}`,
    );
  }
}
