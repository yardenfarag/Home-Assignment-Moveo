import { describe, expect, it } from "vitest";
import type { FinalAnswer } from "@/core/agent/answerSchema";
import { pickVisuals } from "./toolResults";

const answerWith = (toolCalls: { tool: string; input: unknown; output: unknown }[], outOfScope = false) =>
  ({ outOfScope, meta: { toolCalls } }) as unknown as FinalAnswer;

describe("pickVisuals (U3b — chosen by code, never by the LLM)", () => {
  it("skips failed and duplicate calls, puts the most useful first, and caps at two", () => {
    const visuals = pickVisuals(
      answerWith([
        { tool: "rank_hubs", input: { metric: "winter" }, output: { results: [] } },
        { tool: "explain_hub_score", input: { hubId: "dallas" }, output: { hub: "Dallas" } },
        { tool: "explain_hub_score", input: { hubId: "dallas" }, output: { hub: "Dallas" } }, // duplicate
        { tool: "compare_hubs", input: { hubIds: ["a", "b"] }, output: { error: "boom", hubIds: [] } }, // failed
        { tool: "compare_hubs", input: { hubIds: ["miami", "houston"] }, output: { hubs: [] } },
      ]),
    );
    expect(visuals.map((v) => v.kind)).toEqual(["grid", "breakdown"]);
  });

  it("shows nothing for out-of-scope answers", () => {
    expect(pickVisuals(answerWith([{ tool: "rank_hubs", input: {}, output: { results: [] } }], true))).toEqual([]);
  });
});
