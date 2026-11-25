/**
 * @module evals/lib/judging
 *
 * Runs the independent judge over eval answers (J1–J3) and tests the judge
 * itself with planted bad answers (J4): a judge that passes a wrong number or a
 * swallowed false premise can't be trusted, and the report says so.
 */
import type { FinalAnswer } from "../../src/core/agent/answerSchema";
import type { AgentContext } from "../../src/core/agent/context";
import { buildSystemPrompt } from "../../src/core/agent/systemPrompt";
import { explainHubScoreOutput } from "../../src/core/agent/tools/explainHubScore";
import { describeUnknownError } from "../../src/core/errors/boundaryError";
import { isInconsistentVerdict, judgeAnswer, judgePasses, type JudgeModel, type JudgeVerdict } from "../../src/core/judge/judgeAnswer";
import { check } from "./checks";
import type { CheckResult, TurnResult } from "./types";

/** The judge's verdict for one turn (or why there is none). */
export interface TurnJudgment {
  question: string;
  verdict: JudgeVerdict | null;
  error?: string;
}

/**
 * Judges every answered turn of a case run. The judge sees what the agent saw:
 * its system prompt and, in follow-ups, earlier turns' tool results (D65).
 * @param results - the case's turns.
 * @param judge - the judge model.
 * @param ctx - agent context (to rebuild the agent's system prompt).
 * @returns judgments and the matching hard checks (J3: pass AND faithful ≥ 4).
 */
export async function judgeTurns(
  results: TurnResult[],
  judge: JudgeModel,
  ctx: AgentContext,
): Promise<{ judgments: TurnJudgment[]; checks: CheckResult[] }> {
  const briefing = buildSystemPrompt(ctx);
  const judgments: TurnJudgment[] = [];
  const checks: CheckResult[] = [];
  for (const [i, turn] of results.entries()) {
    if (!turn.answer) continue;
    const earlierToolCalls = results.slice(0, i).flatMap((r) => r.answer?.meta.toolCalls ?? []);
    try {
      const verdict = await judgeAnswer(turn.question, turn.answer, judge, { briefing, earlierToolCalls });
      judgments.push({ question: turn.question, verdict });
      const unsupported = verdict.unsupportedClaims.length ? ` · unsupported: ${verdict.unsupportedClaims.join("; ")}` : "";
      const contradiction = isInconsistentVerdict(verdict) ? " · ⚠️ JUDGE CONTRADICTED ITSELF (pass, but low score and no unsupported claims)" : "";
      checks.push(
        check(
          `judge: turn ${i + 1} faithful to data`,
          judgePasses(verdict),
          `verdict ${verdict.verdict}, faithful ${verdict.faithfulToData}/5 — ${verdict.reason}${unsupported}${contradiction}`,
        ),
      );
    } catch (error) {
      judgments.push({ question: turn.question, verdict: null, error: describeUnknownError(error) });
      checks.push(check(`judge: turn ${i + 1} faithful to data`, false, `judge unavailable: ${describeUnknownError(error)}`));
    }
  }
  return { judgments, checks };
}

/** Result of the judge self-test (J4, D109). */
export interface JudgeSelfTest {
  /** Planted answers the judge graded right (bad ones failed, the good one passed). */
  correct: number;
  total: number;
  details: string[];
}

/** A minimal answer built around one real tool result. */
function plantedAnswer(text: string, tool: string, input: object, output: unknown, premiseCheck: FinalAnswer["premiseCheck"]): FinalAnswer {
  return {
    answer: text,
    outOfScope: false,
    hubsMentioned: [],
    dataUsed: [],
    premiseCheck,
    confidence: "high",
    assumptions: [],
    limitations: [],
    followUpSuggestions: [],
    recommendation: null,
    meta: { model: "planted", toolCalls: [{ tool, input, output }], warnings: [], retried: false, confidenceOverridden: false },
  };
}

/**
 * Plants answers built on REAL tool results and checks the judge grades them right (J4, D109):
 * two clearly bad ones must fail, and one correct one must pass. Without the good one, a judge
 * that fails everything looks perfect (a Qwen judge did exactly that in the bakeoff).
 * @param ctx - agent context (real data).
 * @param judge - the judge model.
 * @returns how many planted answers the judge graded right.
 */
export async function judgeSelfTest(ctx: AgentContext, judge: JudgeModel): Promise<JudgeSelfTest> {
  const dallas = explainHubScoreOutput(ctx, { hubId: "dallas" });
  const seattle = explainHubScoreOutput(ctx, { hubId: "seattle" });
  const wrongScore = Math.round((dallas.overallScore + 15.3) * 10) / 10;
  const dallasIsHigh = dallas.level === "high";
  const planted: { label: string; question: string; answer: FinalAnswer; shouldPass: boolean }[] = [
    {
      label: "correct answer (Dallas) must PASS",
      question: "Why is the Dallas hub's weather disruption risk high?",
      shouldPass: true,
      answer: plantedAnswer(
        `${dallasIsHigh ? "Yes" : "Actually, it isn't"}: Dallas's overall score is ${dallas.overallScore}, rated ${dallas.level}, ` +
          `ranking ${dallas.rankOverall} of ${dallas.totalHubs} hubs. Its worst hazard is ${dallas.topHazard}, and the formula adds ` +
          `0.4 × the worst hazard score so one severe hazard is not averaged away.`,
        "explain_hub_score",
        { hubId: "dallas" },
        dallas,
        { hubId: "dallas", hazard: null, claimedLevel: "high", actualLevel: dallas.level, holds: dallasIsHigh },
      ),
    },
    {
      label: "wrong number + wrong driver (Dallas) must FAIL",
      shouldPass: false,
      question: "Why is the Dallas hub's weather disruption risk high?",
      answer: plantedAnswer(
        `Dallas scores ${wrongScore} overall, ranking 1st of 36 hubs, driven mostly by hurricanes.`,
        "explain_hub_score",
        { hubId: "dallas" },
        dallas,
        { hubId: "dallas", hazard: null, claimedLevel: "high", actualLevel: dallas.level, holds: dallas.level === "high" },
      ),
    },
    {
      label: "swallowed a false premise (Seattle hurricanes) must FAIL",
      shouldPass: false,
      question: "Why is Seattle's hurricane risk so high?",
      answer: plantedAnswer(
        "Seattle's hurricane risk is high because Pacific storms regularly bring hurricane-force conditions to the hub.",
        "explain_hub_score",
        { hubId: "seattle" },
        seattle,
        { hubId: "seattle", hazard: "hurricane", claimedLevel: "high", actualLevel: "low", holds: false },
      ),
    },
  ];
  const details: string[] = [];
  let correct = 0;
  for (const p of planted) {
    try {
      const verdict = await judgeAnswer(p.question, p.answer, judge, { briefing: buildSystemPrompt(ctx), earlierToolCalls: [] });
      const right = judgePasses(verdict) === p.shouldPass;
      if (right) correct++;
      details.push(`${right ? "right" : "WRONG"}: ${p.label} (verdict ${verdict.verdict}, faithful ${verdict.faithfulToData}/5)`);
    } catch (error) {
      details.push(`ERROR: ${p.label} — ${describeUnknownError(error)}`);
    }
  }
  return { correct, total: planted.length, details };
}
