/**
 * @module core/judge/judgeAnswer
 *
 * An independent reviewer (J1–J3): a cheap model from a DIFFERENT provider grades
 * an answer against the actual tool results — faithfulness, whether it answers
 * the question, honesty about limits, premise handling, clarity. Code checks
 * already guarantee the numbers; the judge catches what code can't (e.g. a
 * correct-but-evasive answer, or overclaiming).
 * Used by the evals now; reusable later for a non-blocking "Reviewed" badge (J1-c).
 */
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import type { FinalAnswer, ToolCallRecord } from "../agent/answerSchema";
import { getJudgeEnv, type EnvSource } from "../config/env";
import { BoundaryError, describeUnknownError } from "../errors/boundaryError";

/** Score from 1 (bad) to 5 (excellent). */
const score = z.number().int().min(1).max(5);

/** The judge's structured verdict (J3). */
export const judgeVerdictSchema = z.object({
  faithfulToData: score.describe("Is EVERY factual claim and number supported by the tool results? 5 = fully, 1 = invents or contradicts data."),
  answersQuestion: score.describe("Does the answer directly address what was asked?"),
  honestAboutLimits: score.describe("Does it state relevant uncertainty/limits without overclaiming?"),
  premiseHandling: score
    .nullable()
    .describe("If the question assumed something false, does the answer correct it up front? null when the question had no premise."),
  clarity: score.describe("Could an analyst act on it? Clear, concise, well organized."),
  unsupportedClaims: z.array(z.string()).describe("Each claim or number about our hubs or data NOT supported by the evidence (empty if none)."),
  generalKnowledgeClaims: z
    .array(z.string())
    .describe("Widely known context that is not about our data (geography, what a hazard is, official warning sources). Empty if none."),
  verdict: z.enum(["pass", "fail"]).describe("fail if anything is wrong or unsupported, or the question isn't answered."),
  reason: z.string().describe("One sentence explaining the verdict."),
});

/** A judge verdict. */
export type JudgeVerdict = z.infer<typeof judgeVerdictSchema>;

/** The judge model. */
export interface JudgeModel {
  model: LanguageModel;
  modelId: string;
}

/**
 * Longest tool-result text sent to the judge (~15k tokens, ≈ $0.002 on a cheap model).
 * The largest eval answer was ~19.5k chars; a 20k cap once cut off the very result the judge needed.
 */
export const MAX_EVIDENCE_CHARS = 60_000;

/** Per-judgment timeout (CLAUDE.md: every external call has one). */
const JUDGE_TIMEOUT_MS = 45_000;

const JUDGE_SYSTEM = `You are a strict, fair reviewer of answers from a weather-risk analytics assistant for a logistics company.
You receive the analyst's question, the assistant's answer, the premise verdict computed by code, and the exact tool results the assistant had.
Judge ONLY against those tool results and the assistant's briefing (its hub list and method) — not your own knowledge.
In a follow-up, tool results from earlier in the conversation count as evidence too.
General, widely known context that is NOT about our hubs' data (geography, what a hazard is, where official warnings are published) is allowed:
list it in generalKnowledgeClaims and do NOT count it against faithfulToData or put it in unsupportedClaims.
A number, or a claim about a hub's score, rank, level, weather or data source, is never general knowledge. Numbers may be rounded for display (72.43 → 72.4) — that is fine.
Method facts (score scale 0-100, level cut-offs, formula weights, thresholds) are allowed even if not in the tool results.
If code's premise verdict says the premise does NOT hold, the answer must say so clearly near the start.
An out-of-scope question politely declined with no data is a pass.`;

/**
 * What the assistant knew besides this turn's tool results. Without it the judge
 * flags facts the assistant was legitimately given (hub list, method, D65 history).
 */
export interface JudgeBackground {
  /** The assistant's system prompt (hub list, method facts, rules). */
  briefing: string;
  /** Tool results from earlier turns of the same conversation (follow-ups). */
  earlierToolCalls: ToolCallRecord[];
}

/**
 * Serializes tool calls for the judge (duplicate-call stubs left out, truncated if very long).
 * @param calls - tool call records.
 * @returns JSON text.
 */
function toolEvidence(calls: ToolCallRecord[]): string {
  const results = calls
    .filter((c) => !(c.output && typeof c.output === "object" && "sameAsEarlierCall" in c.output))
    .map((c) => ({ tool: c.tool, input: c.input, result: c.output }));
  const text = JSON.stringify(results);
  return text.length > MAX_EVIDENCE_CHARS ? `${text.slice(0, MAX_EVIDENCE_CHARS)}\n… [truncated]` : text;
}

/**
 * Builds the evidence text the judge reads.
 * @param question - the analyst's question.
 * @param answer - the checked answer.
 * @param background - what the assistant knew besides this turn's tools (optional).
 * @returns plain text.
 */
export function buildJudgeEvidence(question: string, answer: FinalAnswer, background?: JudgeBackground): string {
  const tools = toolEvidence(answer.meta.toolCalls);
  const earlier = background?.earlierToolCalls.length ? toolEvidence(background.earlierToolCalls) : null;
  return [
    ...(background ? [`ASSISTANT'S BRIEFING (its system prompt):\n${background.briefing}`] : []),
    ...(earlier ? [`TOOL RESULTS FROM EARLIER IN THE CONVERSATION:\n${earlier}`] : []),
    `QUESTION:\n${question}`,
    `ANSWER:\n${answer.answer}`,
    `PREMISE VERDICT (computed by code):\n${JSON.stringify(answer.premiseCheck, null, 1)}`,
    `OUT OF SCOPE: ${answer.outOfScope}`,
    `STATED LIMITATIONS:\n- ${answer.limitations.join("\n- ") || "(none)"}`,
    `TOOL RESULTS (this turn):\n${tools}`,
  ].join("\n\n");
}

/**
 * Grades one answer.
 * @param question - the analyst's question.
 * @param answer - the checked answer.
 * @param judge - the judge model.
 * @param background - the assistant's briefing and earlier tool results (optional).
 * @returns the verdict.
 * @throws BoundaryError (llm) when the judge call fails.
 */
export async function judgeAnswer(question: string, answer: FinalAnswer, judge: JudgeModel, background?: JudgeBackground): Promise<JudgeVerdict> {
  try {
    const result = await generateText({
      model: judge.model,
      system: JUDGE_SYSTEM,
      prompt: buildJudgeEvidence(question, answer, background),
      output: Output.object({ schema: judgeVerdictSchema }),
      temperature: 0,
      maxRetries: 1,
      timeout: JUDGE_TIMEOUT_MS,
    });
    return result.output;
  } catch (error) {
    throw new BoundaryError({
      name: "JudgeError",
      message: `The judge (${judge.modelId}) could not grade the answer: ${describeUnknownError(error)}`,
      functionName: "judgeAnswer",
      boundary: "llm",
      cause: error,
    });
  }
}

/**
 * The hard check (J5): faithful to the data, score ≥ 4. The pass/fail verdict and the
 * other scores are soft metrics: graded twice on identical answers, the verdict
 * flipped on 4 of 14 while the faithfulness score held steady.
 * @param verdict - the judge's verdict.
 * @returns whether the answer passes the judge.
 */
export function judgePasses(verdict: JudgeVerdict): boolean {
  return verdict.faithfulToData >= 4;
}

/**
 * Whether a verdict contradicts itself: "pass" with faithfulness ≤ 2 and no unsupported claims
 * listed. A Qwen judge did this on about half its answers in the bakeoff (it flipped the 1–5 scale),
 * and its self-test didn't catch it. Such a judge can't be trusted (D109).
 * @param verdict - the judge's verdict.
 * @returns true when the verdict is internally inconsistent.
 */
export function isInconsistentVerdict(verdict: JudgeVerdict): boolean {
  return verdict.verdict === "pass" && verdict.faithfulToData <= 2 && verdict.unsupportedClaims.length === 0;
}

/**
 * Builds the judge model from env (`OPENROUTER_API_KEY`, `JUDGE_MODEL`).
 * @param source - env variables (injectable for tests).
 * @returns the judge model.
 * @throws BoundaryError (config) when env variables are missing.
 */
export function createJudgeModel(source: EnvSource = process.env): JudgeModel {
  const env = getJudgeEnv(source);
  return { model: createOpenRouter({ apiKey: env.OPENROUTER_API_KEY }).chat(env.JUDGE_MODEL), modelId: env.JUDGE_MODEL };
}
