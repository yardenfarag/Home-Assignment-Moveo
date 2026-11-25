import { describe, expect, it } from "vitest";
import type { FinalAnswer } from "@/core/agent/answerSchema";
import { manyHubsContext } from "@/core/agent/testFixtures";
import { compareHubsOutput, type CompareHubsOutput } from "@/core/agent/tools/compareHubs";
import { explainHubScoreOutput } from "@/core/agent/tools/explainHubScore";
import { weatherStatOutput } from "@/core/agent/tools/getWeatherStat";
import { rankHubsOutput } from "@/core/agent/tools/rankHubs";
import { compareCellReason, pickVisuals } from "./toolResults";

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

  it("draws the real (compact) result of every tool", async () => {
    const ctx = manyHubsContext(4);
    const [a, b] = [...ctx.snapshotByHub.keys()];
    const visuals = [
      { tool: "rank_hubs", input: {}, output: rankHubsOutput(ctx, { metric: "wind", region: "South", order: "most", limit: 3 }) },
      { tool: "compare_hubs", input: {}, output: compareHubsOutput(ctx, { hubIds: [a, b], hazards: null }) },
      { tool: "explain_hub_score", input: {}, output: explainHubScoreOutput(ctx, { hubId: a }) },
      { tool: "get_weather_stat", input: {}, output: await weatherStatOutput(ctx, { hubId: a, metric: "snow_day", periodKind: "year", year: 2025, month: null, startDate: null, endDate: null }) },
    ].map((call) => pickVisuals(answerWith([call]))[0]?.kind);
    expect(visuals).toEqual(["ranking", "grid", "breakdown", "seasonality"]);
  });

  it("skips a seasonality result whose months aren't real YYYY-MM months (they'd break the strip)", () => {
    const stat = { threshold: "≥ 0.4 in of snow", period: { start: "2025-01-01", end: "2025-12-31" } };
    const ok = pickVisuals(answerWith([{ tool: "get_weather_stat", input: {}, output: { ...stat, byMonth: [{ month: "2025-01", daysMeeting: 2 }] } }]));
    const bad = pickVisuals(answerWith([{ tool: "get_weather_stat", input: {}, output: { ...stat, byMonth: [{ month: "2025-13", daysMeeting: 2 }] } }]));
    expect(ok).toHaveLength(1);
    expect(bad).toEqual([]);
  });
});

describe("compareCellReason (new and older saved comparison shapes)", () => {
  it("finds a cell's reason in the compact list of reasons", () => {
    const ctx = manyHubsContext(4);
    const [a, b] = [...ctx.snapshotByHub.keys()];
    const data = compareHubsOutput(ctx, { hubIds: [a, b], hazards: null });
    expect(compareCellReason(data, a, "wind")).toMatch(/sources disagree/); // the first test hub's wind is medium
    expect(compareCellReason(data, b, "wind")).toMatch(/tell the same story/);
    expect(compareCellReason(data, a, "hurricane")).toMatch(/FEMA's long-term county frequency record/);
  });

  it("reads the reason from the cell itself in answers saved before results were compact", () => {
    const saved = {
      totalHubs: 36,
      hubs: [{ hubId: "miami", hub: "Miami, FL", hazards: { flood: { score: 80, level: "high", confidence: "high", confidenceReason: "Old per-cell reason." } } }],
    } as unknown as CompareHubsOutput;
    expect(compareCellReason(saved, "miami", "flood")).toBe("Old per-cell reason.");
    expect(compareCellReason(saved, "miami", "heat")).toBeNull(); // no such cell: nothing to show, no crash
  });
});
