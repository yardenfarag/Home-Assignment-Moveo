import { describe, expect, it, vi } from "vitest";
import type { AgentContext } from "../../src/core/agent/context";
import type { AgentModel } from "../../src/core/agent/model";
import type { EvalCase } from "./types";

vi.mock("./oracle", () => ({ buildOracle: () => ({}) }));
vi.mock("./runners", () => ({
  runInProcess: async (evalCase: EvalCase) => {
    await new Promise((r) => setTimeout(r, evalCase.id === "slow" ? 30 : 1));
    return [{ question: evalCase.turns[0], answer: null, ms: 1500 }];
  },
}));

const { latestRunSummary, runEvalSuite } = await import("./suite");

const makeCase = (id: string, pass: boolean): EvalCase => ({
  id,
  title: `Case ${id}`,
  turns: [`question ${id}`],
  check: () => [{ name: "numbers-match", pass, detail: "" }],
});

describe("runEvalSuite (D130)", () => {
  it("streams start, one event per case and done, with a correct summary", async () => {
    const events: { type: string }[] = [];
    const cases = [makeCase("slow", true), makeCase("b", false), makeCase("c", true)];
    const { summary } = await runEvalSuite({
      agent: { modelId: "test/model" } as AgentModel,
      context: {} as AgentContext,
      judge: null,
      concurrency: 2,
      cases,
      onEvent: (e) => events.push(e),
    });
    expect(events.map((e) => e.type)).toEqual(["start", "case", "case", "case", "done"]);
    expect(summary).toMatchObject({ model: "test/model", trigger: "ui", passed: 2, total: 3, judge: null, judgeReliable: null });
    // Results keep the case order even though "slow" finished last.
    expect(summary.cases.map((c) => c.caseId)).toEqual(["slow", "b", "c"]);
    expect(summary.cases[1]).toMatchObject({ pass: false, failed: ["numbers-match"], seconds: 1.5 });
  });
});

describe("latestRunSummary", () => {
  it("skips older events without a summary and returns the newest one that has it", () => {
    const summary = { model: "m", trigger: "cli", passed: 13, total: 13, judge: null, judgeReliable: null, seconds: 90, finishedAt: "2026-11-25T10:00:00Z", cases: [] };
    expect(latestRunSummary([{ payload: { label: "old" } }, { payload: { summary: null } }, { payload: { summary } }])).toEqual(summary);
    expect(latestRunSummary([{ payload: {} }])).toBeNull();
  });
});
