import { describe, expect, it, vi } from "vitest";
import type { StoredSnapshot } from "../db/scoresRepository";
import type { Hub } from "../domain/hub";
import { HAZARDS, type Hazard } from "../scoring/types";
import { loadWidgetsData } from "./loadWidgetsData";
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
  const weatherBounds = { earliest: "2021-01-01", latest: "2026-11-24" };
  const data = buildWidgetsData({ hubs, snapshots, weatherBounds, femaVersions: ["December 2025"] });

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
      femaVersion: "FEMA National Risk Index (December 2025)",
      femaVersionMatchesAnchors: true,
      oldestWindowEnd: "2026-11-24",
      staleHubs: [],
    });
  });

  it("breaks ties by hub name and says how many hubs share the leader's score", () => {
    const tied = buildWidgetsData({
      hubs,
      snapshots: [snapshot("seattle", 50, { heat: 100 }), snapshot("phoenix", 50, { heat: 100 }), snapshot("dallas", 50, { heat: 100 }), snapshot("boston", 40, { heat: 10 })],
      weatherBounds,
      femaVersions: ["December 2025"],
    });
    expect(tied.hazardLeaders.find((l) => l.hazard === "heat")).toMatchObject({ hubId: "dallas", score: 100, tiedWith: 2 });
    expect(tied.topHubs.map((h) => [h.hubId, h.rank])).toEqual([
      ["dallas", 1],
      ["phoenix", 1],
      ["seattle", 1],
      ["boston", 4],
    ]);
  });

  it("names hubs whose data is days older than the newest (a hub that failed to update)", () => {
    const stale = { ...snapshot("boston", 60.3, {}), window: { start: "2021-11-20", end: "2026-11-19" }, createdAt: "2026-11-20T06:05:00Z" };
    const result = buildWidgetsData({ hubs, snapshots: [...snapshots.filter((s) => s.hubId !== "boston"), stale], weatherBounds, femaVersions: ["December 2025"] });
    expect(result.dataStatus.oldestWindowEnd).toBe("2026-11-19");
    expect(result.dataStatus.staleHubs).toEqual([{ hubId: "boston", hub: "Boston, XX", windowEnd: "2026-11-19", daysBehind: 5, scoredAt: "2026-11-20T06:05:00Z" }]);
  });

  it("shows the STORED FEMA version and flags one that differs from the anchors'", () => {
    const result = buildWidgetsData({ hubs, snapshots, weatherBounds, femaVersions: ["March 2027"] });
    expect(result.dataStatus).toMatchObject({ femaVersion: "FEMA National Risk Index (March 2027)", femaVersionMatchesAnchors: false });
  });

  it("throws a plain error (not a TypeError) when no snapshot belongs to an active hub", () => {
    expect(() => buildWidgetsData({ hubs: [hub("omaha")], snapshots, weatherBounds, femaVersions: [] })).toThrow("No snapshots of active hubs");
  });
});

describe("loadWidgetsData", () => {
  const deps = {
    listActiveHubs: async () => [hub("miami")],
    getLatestSnapshots: async () => [snapshot("miami", 69.3, { hurricane: 100 })],
    getWeatherBounds: async () => ({ earliest: "2021-01-01", latest: "2026-11-24" }),
    getStoredNriVersions: async () => ["December 2025"],
    log: vi.fn(),
  };

  it("answers NoDataError (the friendly 'no data yet' path) when no active hub has a snapshot", async () => {
    await expect(loadWidgetsData({ ...deps, listActiveHubs: async () => [hub("omaha")] })).rejects.toMatchObject({ name: "NoDataError" });
  });

  it("logs a FEMA version mismatch in the boundary format", async () => {
    const log = vi.fn();
    await loadWidgetsData({ ...deps, getStoredNriVersions: async () => ["March 2027"], log });
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^FemaVersionMismatch \|\| Stored FEMA data is NRI 'March 2027'.* \|\| loadWidgetsData \|\| 🐘$/));
  });
});
