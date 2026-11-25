import { describe, expect, it } from "vitest";
import { judgeReliable, rankModels, summarize, type ModelSummary } from "./bakeoff";
import { checkKind } from "./checks";
import type { CheckResult, ResultsFile } from "./types";

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

describe("rankModels tie band (N6)", () => {
  it("counts the band on the larger of the two pools, so fewer runs don't buy a wider band", () => {
    // Leader 39/39. A 10-run model at 8/10 would tie on its own count (2/10), not on the common basis (2/39).
    const ranked = rankModels([model({ model: "leader", passed: 39, caseRuns: 39 }), model({ model: "few-runs", passed: 8, caseRuns: 10, costPerAnswer: 0.001 })]);
    expect(ranked[0].summary.model).toBe("leader");
    expect(ranked[1].verdict).toBe("less accurate");
  });
});

/** A results file with one run holding the given checks. */
const file = (checks: CheckResult[]): ResultsFile => ({
  label: "x/model",
  judge: "j/judge",
  metrics: { turns: 1, costUsd: null },
  runs: [{ caseId: "c", title: "C", results: [{ question: "q", answer: null, ms: 1000 }], checks, pass: checks.every((c) => c.pass) }],
});

describe("bakeoff gate (S2)", () => {
  it("gates on the check's kind, not its name", () => {
    const s = summarize("x/model", [
      file([
        { name: "anything at all", pass: false, detail: "", kind: "gate" },
        { name: "premise-looking name", pass: false, detail: "", kind: "behavior" },
        { name: "judge: turn 1 faithful to data", pass: false, detail: "", kind: "judge" },
      ]),
    ]);
    expect(s.gateFailures).toEqual(["c: anything at all"]);
    expect(s.judgeFailures).toBe(1);
    expect(s.codeFailures).toBe(2);
  });

  it("still reads files saved before checks had a kind (classified by the old names)", () => {
    const legacy = (name: string): CheckResult => ({ name, pass: false, detail: "" });
    for (const name of ["premise flagged as wrong", "Miami hurricane score matches", "first hub named = computed #1", "no Boise numbers", "percentage matches computed value", "stat for calendar 2025", "answer says 2025"]) {
      expect(checkKind(legacy(name))).toBe("gate");
    }
    for (const name of ["rank_hubs(winter, Midwest) called", "marked out of scope", "recommendation given"]) {
      expect(checkKind(legacy(name))).toBe("behavior");
    }
    expect(checkKind(legacy("judge: turn 1 faithful to data"))).toBe("judge");
  });
});

describe("judgeReliable (S1)", () => {
  it("needs every planted answer right in every file, accepting the legacy `caught` field", () => {
    expect(judgeReliable([{ ...file([]), selfTest: { correct: 3, total: 3 } }, { ...file([]), selfTest: { caught: 3, total: 3 } }])).toBe(true);
    expect(judgeReliable([{ ...file([]), selfTest: { correct: 3, total: 3 } }, { ...file([]), selfTest: { correct: 2, total: 3 } }])).toBe(false);
    expect(judgeReliable([{ ...file([]), selfTest: null }])).toBe(false);
  });
});
