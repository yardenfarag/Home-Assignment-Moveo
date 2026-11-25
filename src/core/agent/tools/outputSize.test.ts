/**
 * Size budgets for what the model gets from each tool (Step 18: small tool results). Every tool
 * result is paid for again at each later step and in every follow-up turn, so a result that grows
 * past its budget fails here. Sizes are JSON characters (≈ 4 per token) on a 36-hub test context
 * that mirrors the live data's shape (see `manyHubsContext`).
 */
import { describe, expect, it } from "vitest";
import { standingCaveatCatalog } from "../../scoring/caveats";
import { DAY_METRIC_IDS } from "../../scoring/dayMetrics";
import { HAZARDS } from "../../scoring/types";
import { ToolLedger } from "../ledger";
import { manyHubsContext } from "../testFixtures";
import { compareHubsOutput } from "./compareHubs";
import { explainHubScoreOutput } from "./explainHubScore";
import { weatherStatOutput } from "./getWeatherStat";
import { rankHubsOutput } from "./rankHubs";
import { runTool } from "./shared";

const ctx = manyHubsContext(36);
const ids = [...ctx.snapshotByHub.keys()];

/** A get_weather_stat call for the first hub. */
const stat = (input: Partial<Parameters<typeof weatherStatOutput>[1]>) =>
  weatherStatOutput(ctx, { hubId: ids[0], metric: "snow_day", periodKind: "year", year: null, month: null, startDate: null, endDate: null, ...input });

/** Each case: tool name, a builder, and the most characters the model may get for it as a conversation's first call. */
const CASES: { name: string; tool: string; build: () => unknown; budget: number }[] = [
  { name: "rank_hubs overall, top 5", tool: "rank_hubs", build: () => rankHubsOutput(ctx, { metric: "overall", region: null, order: "most", limit: 5 }), budget: 1_500 },
  { name: "rank_hubs flood, top 5", tool: "rank_hubs", build: () => rankHubsOutput(ctx, { metric: "flood", region: null, order: "most", limit: 5 }), budget: 2_100 },
  { name: "rank_hubs wind, all 36", tool: "rank_hubs", build: () => rankHubsOutput(ctx, { metric: "wind", region: null, order: "most", limit: 36 }), budget: 8_500 },
  { name: "compare_hubs, 2 hubs", tool: "compare_hubs", build: () => compareHubsOutput(ctx, { hubIds: ids.slice(0, 2), hazards: null }), budget: 5_100 },
  { name: "compare_hubs, 5 hubs", tool: "compare_hubs", build: () => compareHubsOutput(ctx, { hubIds: ids.slice(0, 5), hazards: null }), budget: 8_200 },
  { name: "explain_hub_score", tool: "explain_hub_score", build: () => explainHubScoreOutput(ctx, { hubId: ids[0] }), budget: 6_600 },
  { name: "get_weather_stat, one year", tool: "get_weather_stat", build: () => stat({ year: 2025 }), budget: 1_100 },
  { name: "get_weather_stat, 5-year range", tool: "get_weather_stat", build: () => stat({ periodKind: "range", startDate: "2021-12-01", endDate: "2026-11-24" }), budget: 3_000 },
];

/**
 * What the model gets for one call (through runTool, so caveat de-duplication applies).
 * @param ledger - the turn's ledger.
 * @param name - the case name.
 * @returns the JSON size in characters.
 */
async function modelSize(ledger: ToolLedger, name: string): Promise<number> {
  const c = CASES.find((x) => x.name === name)!;
  const output = await runTool(c.tool, { case: c.name }, { ledger, callbacks: {} }, c.build as () => never);
  return JSON.stringify(output).length;
}

describe("tool result size budgets (Step 18)", () => {
  it.each(CASES.map((c) => [c.name, c.budget] as const))("%s stays within %i characters", async (name, budget) => {
    expect(await modelSize(new ToolLedger(), name)).toBeLessThanOrEqual(budget);
  });

  it("later calls in a turn don't repeat the caveats the model already has", async () => {
    const ledger = new ToolLedger();
    await modelSize(ledger, "explain_hub_score");
    expect(await modelSize(ledger, "compare_hubs, 2 hubs")).toBeLessThanOrEqual(3_300);
    expect(await modelSize(ledger, "rank_hubs flood, top 5")).toBeLessThanOrEqual(1_250);
  });

  it("a ranking states facts shared by every row once, not per row", () => {
    const all = rankHubsOutput(ctx, { metric: "wind", region: null, order: "most", limit: 36 });
    expect(all.totalHubs).toBe(36);
    expect(all.results.every((r) => !("totalHubs" in r) && !("selectionSize" in r) && !("rankInRegion" in r))).toBe(true);
    // A confidence reason only where the confidence isn't high (prompt rule 4).
    expect(all.results.filter((r) => "confidenceReason" in r).map((r) => r.confidence)).toEqual(all.results.filter((r) => r.confidence !== "high").map((r) => r.confidence));
    expect(all.results.some((r) => r.confidence === "medium")).toBe(true);

    const south = rankHubsOutput(ctx, { metric: "wind", region: "South", order: "most", limit: 3 });
    expect(south.hubsInRegion).toBe(9);
    expect(south.results.map((r) => r.rankInRegion)).toEqual([1, 2, 3]);
    expect(south.results.every((r) => !("region" in r))).toBe(true); // the region is stated once at the top
  });

  it("a comparison lists each confidence reason once, with every cell it explains", () => {
    const output = compareHubsOutput(ctx, { hubIds: ids.slice(0, 5), hazards: null });
    const cells = Object.values(output.confidenceReasons).flat();
    expect(cells.sort()).toEqual(ids.slice(0, 5).flatMap((id) => HAZARDS.map((h) => `${id}/${h}`)).sort());
    expect(Object.keys(output.confidenceReasons).length).toBeLessThan(cells.length);
  });

  it("every standing caveat a tool attaches is in the caveat catalog, so it can be named by id", async () => {
    const known = new Set(standingCaveatCatalog(ctx.units).map((c) => c.text));
    const outputs = [
      explainHubScoreOutput(ctx, { hubId: ids[0] }),
      rankHubsOutput(ctx, { metric: "overall", region: null, order: "most", limit: 1 }),
      ...HAZARDS.map((h) => rankHubsOutput(ctx, { metric: h, region: null, order: "most", limit: 1 })),
      compareHubsOutput(ctx, { hubIds: ids.slice(0, 2), hazards: null }),
      ...(await Promise.all(DAY_METRIC_IDS.map((metric) => stat({ metric, year: 2025 })))),
    ];
    const missing = outputs.flatMap((o) => o.caveats).filter((text) => !known.has(text));
    expect(missing).toEqual([]);
  });
});
