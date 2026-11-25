import { describe, expect, it } from "vitest";
import { GATE_CHECK, rankModels, type ModelSummary } from "./bakeoff";

/** A model summary with sensible defaults. */
const model = (over: Partial<ModelSummary>): ModelSummary => ({
  model: "x/model",
  caseRuns: 39,
  passed: 37,
  gateFailures: [],
  codeFailures: 0,
  judgeFailures: 2,
  answers: 42,
  costPerAnswer: 0.07,
  avgSeconds: 10,
  p95Seconds: 20,
  avgToolCalls: 2,
  duplicateCalls: 0,
  untraced: 0,
  retries: 0,
  faithful: 4.5,
  judgeInconsistent: 0,
  failedCases: [],
  ...over,
});

describe("rankModels (B4)", () => {
  it("among models tied on accuracy (within 2 case-runs), the cheapest wins", () => {
    const ranked = rankModels([
      model({ model: "pricey", passed: 38, costPerAnswer: 0.07 }),
      model({ model: "cheap", passed: 36, costPerAnswer: 0.004 }),
    ]);
    expect(ranked.map((r) => r.summary.model)).toEqual(["cheap", "pricey"]);
    expect(ranked[0].verdict).toContain("🏆");
  });

  it("a clearly more accurate model beats a cheaper one outside the tie band", () => {
    const ranked = rankModels([model({ model: "cheap", passed: 30, costPerAnswer: 0.001 }), model({ model: "good", passed: 38 })]);
    expect(ranked[0].summary.model).toBe("good");
    expect(ranked[1].verdict).toBe("less accurate");
  });

  it("a premise/data failure or a slow p95 disqualifies, even with the best pass rate", () => {
    const ranked = rankModels([
      model({ model: "wrong-number", passed: 39, gateFailures: ["miami-vs-houston: Miami hurricane score matches"] }),
      model({ model: "slow", passed: 39, p95Seconds: 45 }),
      model({ model: "ok", passed: 35 }),
    ]);
    expect(ranked[0].summary.model).toBe("ok");
    expect(ranked.find((r) => r.summary.model === "wrong-number")?.verdict).toContain("gate");
    expect(ranked.find((r) => r.summary.model === "slow")?.verdict).toContain("p95");
  });

  it("speed breaks a tie on accuracy and cost", () => {
    const ranked = rankModels([model({ model: "slow", avgSeconds: 15 }), model({ model: "fast", avgSeconds: 8 })]);
    expect(ranked[0].summary.model).toBe("fast");
  });
});

describe("GATE_CHECK", () => {
  it("covers premise and data checks, not tool-choice or judge checks", () => {
    for (const name of ["premise flagged as wrong", "Miami hurricane score matches", "first hub named = computed #1", "no Boise numbers", "percentage matches computed value"]) {
      expect(GATE_CHECK.test(name)).toBe(true);
    }
    for (const name of ["rank_hubs(winter, Midwest) called", "marked out of scope", "recommendation given"]) {
      expect(GATE_CHECK.test(name)).toBe(false);
    }
  });
});
