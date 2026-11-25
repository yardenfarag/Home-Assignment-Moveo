import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import type { FinalAnswer } from "../agent/answerSchema";
import { buildJudgeEvidence, isInconsistentVerdict, judgeAnswer, judgePasses, MAX_EVIDENCE_CHARS, type JudgeVerdict } from "./judgeAnswer";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};

const answer = {
  answer: "Dallas is High (72.4).",
  outOfScope: false,
  premiseCheck: { hubId: "dallas", hazard: null, claimedLevel: "high", actualLevel: "high", holds: true },
  limitations: ["Exposure, not losses."],
  meta: {
    toolCalls: [
      { tool: "explain_hub_score", input: { hubId: "dallas" }, output: { overallScore: 72.4, hubIds: ["dallas"] } },
      { tool: "explain_hub_score", input: { hubId: "dallas" }, output: { sameAsEarlierCall: true, hubIds: [] } },
    ],
  },
} as unknown as FinalAnswer;

const verdict: JudgeVerdict = {
  faithfulToData: 5,
  answersQuestion: 5,
  honestAboutLimits: 4,
  premiseHandling: 5,
  clarity: 4,
  unsupportedClaims: [],
  generalKnowledgeClaims: [],
  verdict: "pass",
  reason: "Accurate and on point.",
};

describe("buildJudgeEvidence", () => {
  it("includes the question, the answer, the code's premise verdict and the tool results (not duplicates)", () => {
    const evidence = buildJudgeEvidence("Why is Dallas high?", answer);
    expect(evidence).toContain("Why is Dallas high?");
    expect(evidence).toContain("72.4");
    expect(evidence).toContain('"holds": true');
    expect(evidence).not.toContain("sameAsEarlierCall");
    expect(evidence).not.toContain("BRIEFING");
  });

  it("keeps a large multi-tool answer whole (a 20k cap once cut off the result the judge needed)", () => {
    const big = { ...answer, meta: { ...answer.meta, toolCalls: Array.from({ length: 4 }, (_, i) => ({ tool: "explain_hub_score", input: { i }, output: { blob: "x".repeat(6_000), last: `marker-${i}` } })) } } as FinalAnswer;
    const evidence = buildJudgeEvidence("Houston or Denver?", big);
    expect(evidence).toContain("marker-3");
    expect(evidence).not.toContain("[truncated]");
    expect(MAX_EVIDENCE_CHARS).toBeGreaterThanOrEqual(60_000);
  });

  it("adds the assistant's briefing and earlier turns' tool results when given (follow-ups, hub list)", () => {
    const evidence = buildJudgeEvidence("Why that one?", answer, {
      briefing: "# Our hubs\n- boise-not-here",
      earlierToolCalls: [{ tool: "rank_hubs", input: { hazard: "winter" }, output: { rank: 1, hubId: "minneapolis" } }],
    });
    expect(evidence).toContain("ASSISTANT'S BRIEFING");
    expect(evidence).toContain("# Our hubs");
    expect(evidence).toContain("EARLIER IN THE CONVERSATION");
    expect(evidence).toContain("minneapolis");
  });
});

describe("judgeAnswer", () => {
  it("returns the model's structured verdict", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{ type: "text", text: JSON.stringify(verdict) }],
        finishReason: { unified: "stop", raw: undefined },
        usage,
        warnings: [],
      }),
    });
    await expect(judgeAnswer("Why is Dallas high?", answer, { model, modelId: "mock/judge" })).resolves.toEqual(verdict);
  });
});

describe("isInconsistentVerdict", () => {
  it("flags a 'pass' with a near-zero faithfulness score and no unsupported claims (a flipped scale)", () => {
    expect(isInconsistentVerdict({ ...verdict, faithfulToData: 1 })).toBe(true);
    expect(isInconsistentVerdict(verdict)).toBe(false);
    expect(isInconsistentVerdict({ ...verdict, faithfulToData: 1, verdict: "fail" })).toBe(false);
    expect(isInconsistentVerdict({ ...verdict, faithfulToData: 2, unsupportedClaims: ["Dallas ranks 1st"] })).toBe(false);
  });
});

describe("judgePasses (J5 hard check)", () => {
  it("needs faithfulness ≥ 4; the verdict alone doesn't fail it (too noisy)", () => {
    expect(judgePasses(verdict)).toBe(true);
    expect(judgePasses({ ...verdict, faithfulToData: 4, verdict: "fail" })).toBe(true);
    expect(judgePasses({ ...verdict, faithfulToData: 3 })).toBe(false);
  });
});
