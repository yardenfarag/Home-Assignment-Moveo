import { describe, expect, it } from "vitest";
import type { LlmAnswer } from "./answerSchema";
import { RECOMMENDATION_DISCLAIMER } from "./config";
import { finalizeAnswer } from "./finalizeAnswer";
import { ToolLedger } from "./ledger";

/** Ledger with one explain_hub_score result for Dallas (overall 72.4 high, severe storms 100). */
function dallasLedger(): ToolLedger {
  const ledger = new ToolLedger();
  ledger.record(
    "explain_hub_score",
    { hubId: "dallas" },
    {
      hubIds: ["dallas"],
      confidence: "high",
      caveats: ["Severe storms come from FEMA only."],
      overallScore: 72.4,
      hazards: { severeStorms: { score: 100 }, heat: { score: 84.2 } },
    } as never,
  );
  return ledger;
}

const levels = new Map([["dallas", { overall: "high" as const, hazards: { severeStorms: "high" as const, heat: "high" as const } }]]);

/** A valid answer about Dallas; override fields per test. */
function answer(overrides: Partial<LlmAnswer> = {}): LlmAnswer {
  return {
    answer: "Dallas scores 72.4, driven by severe storms (100).",
    outOfScope: false,
    hubsMentioned: ["dallas"],
    dataUsed: [{ hubId: "dallas", label: "overall score", value: 72.4, unit: "score 0-100" }],
    premiseClaim: null,
    confidence: "medium",
    assumptions: [],
    limitations: ["Model-written limitation."],
    followUpSuggestions: [],
    recommendation: null,
    ...overrides,
  };
}

const context = (ledger = dallasLedger()) => ({ ledger, levelsByHub: levels, model: "test/model", retried: false });

describe("finalizeAnswer — numbers must come from tools (G3)", () => {
  it("accepts numbers that match tool results, including display rounding", () => {
    const result = finalizeAnswer(answer({ dataUsed: [{ hubId: "dallas", label: "heat", value: 84, unit: "score" }] }), context());
    expect(result.ok).toBe(true);
  });

  it("rejects an invented number", () => {
    const result = finalizeAnswer(answer({ dataUsed: [{ hubId: "dallas", label: "overall", value: 81, unit: "score" }] }), context());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems[0]).toMatch(/81.*not found in any tool result/);
  });

  it("rejects hubs the tools never returned", () => {
    const result = finalizeAnswer(answer({ hubsMentioned: ["dallas", "miami"] }), context());
    expect(result.ok).toBe(false);
  });

  it("does not mistake a range dash for a minus sign, and knows the 0-100 scale bounds", () => {
    const result = finalizeAnswer(answer({ answer: "Scores run 0-100; Dallas scores 72.4." }), context());
    expect(result.ok && result.answer.meta.warnings).toEqual([]);
  });

  it("knows the method's own facts: cutoffs, formula weights, 50/50 blend, thresholds (from config)", () => {
    const result = finalizeAnswer(
      answer({
        answer:
          "Dallas scores 72.4: High starts at 67. Overall = 0.6 × weighted average + 0.4 × worst hazard; hurricane weighs 25%. " +
          "Winter blends 50% observed with 50% FEMA; a snow day is ≥ 0.4 in (1 cm).",
      }),
      context(),
    );
    expect(result.ok && result.answer.meta.warnings).toEqual([]);
  });

  it("warns (does not block) about numbers in the text that no tool returned", () => {
    const result = finalizeAnswer(answer({ answer: "Dallas scores 72.4, roughly 3 times riskier than average." }), context());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.answer.meta.warnings[0]).toMatch(/3/);
  });
});

describe("finalizeAnswer — code decides confidence, premise, caveats, disclaimer", () => {
  it("overrides the model's confidence with the weakest tool confidence (G6)", () => {
    const result = finalizeAnswer(answer({ confidence: "medium" }), context());
    expect(result.ok && result.answer.confidence).toBe("high");
    expect(result.ok && result.answer.meta.confidenceOverridden).toBe(true);
  });

  it("decides whether the premise holds from the real level (G5)", () => {
    const holds = finalizeAnswer(answer({ premiseClaim: { hubId: "dallas", hazard: null, claimedLevel: "high" } }), context());
    expect(holds.ok && holds.answer.premiseCheck).toEqual({
      hubId: "dallas",
      hazard: null,
      claimedLevel: "high",
      actualLevel: "high",
      holds: true,
    });
    const fails = finalizeAnswer(answer({ premiseClaim: { hubId: "dallas", hazard: null, claimedLevel: "low" } }), context());
    expect(fails.ok && fails.answer.premiseCheck?.holds).toBe(false);
  });

  it("always includes the standing caveats of the data used (G4)", () => {
    const result = finalizeAnswer(answer(), context());
    expect(result.ok && result.answer.limitations).toEqual(["Model-written limitation.", "Severe storms come from FEMA only."]);
  });

  it("adds the fixed disclaimer to recommendations, and refuses recommendations without data (D8)", () => {
    const recommendation = { stance: "lean_yes" as const, summary: "Prioritize Dallas.", reasons: ["72.4 overall"], whatWouldChangeIt: [] };
    const ok = finalizeAnswer(answer({ recommendation }), context());
    expect(ok.ok && ok.answer.recommendation?.disclaimer).toBe(RECOMMENDATION_DISCLAIMER);
    const noData = finalizeAnswer(answer({ recommendation, dataUsed: [] }), context());
    expect(noData.ok).toBe(false);
  });

  it("out-of-scope answers have no confidence and no caveats", () => {
    const result = finalizeAnswer(
      answer({ outOfScope: true, hubsMentioned: [], dataUsed: [], limitations: [], answer: "I only cover weather risk for our hubs." }),
      context(new ToolLedger()),
    );
    expect(result.ok && result.answer.confidence).toBeNull();
    expect(result.ok && result.answer.limitations).toEqual([]);
  });
});
