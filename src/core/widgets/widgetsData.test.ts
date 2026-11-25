import { describe, expect, it } from "vitest";
import type { StoredSnapshot } from "../db/scoresRepository";
import type { Hub } from "../domain/hub";
import { HAZARDS, type Hazard } from "../scoring/types";
import { buildWidgetsData } from "./widgetsData";

const hub = (id: string): Hub => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  state: "XX",
  region: "South",
  latitude: 0,
  longitude: 0,
  timezone: "UTC",
  countyFips: null,
  countyName: null,
  isActive: true,
});

/** Minimal snapshot: overall score and per-hazard scores. */
function snapshot(hubId: string, overall: number, hazardScores: Partial<Record<Hazard, number>>): StoredSnapshot {
  const hazards = Object.fromEntries(
    HAZARDS.map((h) => [
      h,
      { hazard: h, score: hazardScores[h] ?? 0, observedScore: null, femaScore: null, confidence: "high", confidenceReason: "", inputs: [] },
    ]),
  ) as unknown as StoredSnapshot["hazards"];
  return {
    hubId,
    runId: "run-1",
    createdAt: "2026-11-25T11:15:30Z",
    scoringVersion: "v1",
    window: { start: "2021-11-25", end: "2026-11-24" },
    overallScore: overall,
    weightedAverage: overall,
    riskLevel: overall >= 67 ? "high" : overall >= 34 ? "medium" : "low",
    topHazard: "hurricane",
    confidence: "high",
    hazards,
    observedPerYear: null,
    coverage: null,
  };
}

describe("buildWidgetsData", () => {
  const hubs = ["miami", "dallas", "denver", "seattle", "boston", "phoenix"].map(hub);
  const snapshots = [
    snapshot("miami", 69.3, { hurricane: 100 }),
    snapshot("dallas", 72.4, { severeStorms: 100, heat: 84 }),
    snapshot("denver", 57.9, { winter: 52 }),
    snapshot("seattle", 37.3, { winter: 60 }),
    snapshot("boston", 60.3, { wind: 49 }),
    snapshot("phoenix", 54.5, { heat: 100 }),
  ];
  const data = buildWidgetsData({ hubs, snapshots, weatherBounds: { earliest: "2021-01-01", latest: "2026-11-24" } });

  it("lists the top 5 hubs by overall score with rank and level", () => {
    expect(data.topHubs.map((h) => [h.hubId, h.rank, h.level])).toEqual([
      ["dallas", 1, "high"],
      ["miami", 2, "high"],
      ["boston", 3, "medium"],
      ["denver", 4, "medium"],
      ["phoenix", 5, "medium"],
    ]);
  });

  it("names the leading hub for each hazard", () => {
    const leader = (h: Hazard) => data.hazardLeaders.find((l) => l.hazard === h)!;
    expect(leader("hurricane").hubId).toBe("miami");
    expect(leader("winter").hubId).toBe("seattle");
    expect(leader("heat")).toMatchObject({ hubId: "phoenix", score: 100, level: "high" });
    expect(data.hazardLeaders).toHaveLength(6);
  });

  it("reports data freshness", () => {
    expect(data.dataStatus).toMatchObject({
      weatherThrough: "2026-11-24",
      hubCount: 6,
      scoredAt: "2026-11-25T11:15:30Z",
      scoringVersion: "v1",
    });
  });
});
