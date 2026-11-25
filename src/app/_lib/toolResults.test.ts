import { describe, expect, it } from "vitest";
import type { FinalAnswer } from "@/core/agent/answerSchema";
import { pickVisuals } from "./toolResults";

const answerWith = (toolCalls: { tool: string; input: unknown; output: unknown }[], outOfScope = false) =>
  ({ outOfScope, meta: { toolCalls } }) as unknown as FinalAnswer;

/** Minimal outputs that pass each visual's shape check. */
const BREAKDOWN = { hub: "Dallas", formula: { contributions: [] }, hazards: [], topHazard: "wind" };
const GRID = { hubs: [{ hubId: "miami", hazards: {} }] };
const RANKING = { results: [] };

describe("pickVisuals (U3b — chosen by code, never by the LLM)", () => {
  it("skips failed and duplicate calls, puts the most useful first, and caps at two", () => {
    const visuals = pickVisuals(
      answerWith([
        { tool: "rank_hubs", input: { metric: "winter" }, output: RANKING },
        { tool: "explain_hub_score", input: { hubId: "dallas" }, output: BREAKDOWN },
        { tool: "explain_hub_score", input: { hubId: "dallas" }, output: BREAKDOWN }, // duplicate
        { tool: "compare_hubs", input: { hubIds: ["a", "b"] }, output: { error: "boom", hubIds: [] } }, // failed
        { tool: "compare_hubs", input: { hubIds: ["miami", "houston"] }, output: GRID },
      ]),
    );
    expect(visuals.map((v) => v.kind)).toEqual(["grid", "breakdown"]);
  });

  it("shows nothing for out-of-scope answers", () => {
    expect(pickVisuals(answerWith([{ tool: "rank_hubs", input: {}, output: RANKING }], true))).toEqual([]);
  });

  it("skips outputs that don't look like the tool's result, and unknown tools (S11)", () => {
    const visuals = pickVisuals(
      answerWith([
        { tool: "explain_hub_score", input: { hubId: "dallas" }, output: { hub: "Dallas" } }, // no formula
        { tool: "compare_hubs", input: {}, output: { hubs: [] } }, // nothing to compare
        { tool: "get_weather_stat", input: {}, output: { byMonth: [] } }, // no period or threshold
        { tool: "rank_hubs", input: {}, output: null },
        { tool: "rank_hubs", input: {}, output: [1, 2] },
        { tool: "toString", input: {}, output: RANKING }, // not a tool, even though objects have it
        { tool: "make_coffee", input: {}, output: RANKING },
      ]),
    );
    expect(visuals).toEqual([]);
  });

  it("copes with a saved answer missing its meta", () => {
    expect(pickVisuals({ outOfScope: false } as unknown as FinalAnswer)).toEqual([]);
  });
});
