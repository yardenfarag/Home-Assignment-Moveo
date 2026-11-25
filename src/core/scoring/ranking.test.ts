import { describe, expect, it } from "vitest";
import { competitionRanks, rankHubs, scoreSpread } from "./ranking";

describe("competitionRanks", () => {
  it("gives ties the same rank and skips after them (1, 2, 2, 4)", () => {
    const ranks = competitionRanks([
      { id: "a", score: 90 },
      { id: "b", score: 70 },
      { id: "c", score: 70 },
      { id: "d", score: 10 },
    ]);
    expect(Object.fromEntries(ranks)).toEqual({ a: 1, b: 2, c: 2, d: 4 });
  });
});

describe("tie-breaks", () => {
  it("lists hubs with equal scores by hub id, whatever the input order", () => {
    const rows = ["c", "a", "b"].map((hubId) => ({ hubId, region: "South" as const, scores: { overall: 100 } }));
    expect(rankHubs(rows, { metric: "overall", order: "most", limit: 3 }).map((r) => [r.hubId, r.rankAmongAll])).toEqual([
      ["a", 1],
      ["b", 1],
      ["c", 1],
    ]);
  });
});

describe("scoreSpread (E10 — gaps are computed in code, never by the LLM)", () => {
  it("names the highest and lowest and the points between them (rounded to 1 decimal)", () => {
    expect(
      scoreSpread([
        { hubId: "houston", score: 69.1 },
        { hubId: "denver", score: 57.9 },
      ]),
    ).toEqual({ highestHubId: "houston", lowestHubId: "denver", spread: 11.2 });
  });

  it("returns null for fewer than two scores", () => {
    expect(scoreSpread([{ hubId: "a", score: 1 }])).toBeNull();
  });
});

describe("rankHubs", () => {
  const rows = [
    { hubId: "minneapolis", region: "Midwest" as const, scores: { overall: 59.9, winter: 86.5 } },
    { hubId: "detroit", region: "Midwest" as const, scores: { overall: 50.7, winter: 70.1 } },
    { hubId: "miami", region: "South" as const, scores: { overall: 69.3, winter: 6 } },
    { hubId: "chicago", region: "Midwest" as const, scores: { overall: 52.4, winter: 49 } },
  ];

  it("filters by region but keeps the rank among ALL hubs", () => {
    const result = rankHubs(rows, { metric: "winter", region: "Midwest", order: "most", limit: 2 });
    expect(result.map((r) => [r.hubId, r.rankAmongAll, r.rankInSelection])).toEqual([
      ["minneapolis", 1, 1],
      ["detroit", 2, 2],
    ]);
    expect(result[0].totalHubs).toBe(4);
    expect(result[0].selectionSize).toBe(3);
  });

  it("can list the least exposed first", () => {
    const result = rankHubs(rows, { metric: "overall", order: "least", limit: 1 });
    expect(result[0].hubId).toBe("detroit");
    expect(result[0].rankAmongAll).toBe(4); // still rank 4 of 4 by exposure
  });
});
