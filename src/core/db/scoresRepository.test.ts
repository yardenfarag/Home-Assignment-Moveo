import { describe, expect, it, vi } from "vitest";
import { HAZARDS } from "../scoring/types";
import { loadLatestSnapshots, type LatestSnapshotReader } from "./scoresRepository";

/**
 * A stored `score_snapshots` row.
 * @param hubId - hub slug.
 * @param runId - scoring run.
 * @param createdAt - when it was saved.
 * @param windowEnd - the newest weather day it used.
 * @returns the raw row.
 */
function row(hubId: string, runId: string, createdAt: string, windowEnd: string) {
  const hazard = (h: string) => ({ hazard: h, score: 50, observedScore: null, femaScore: 50, confidence: "high", confidenceReason: "", inputs: [] });
  return {
    hub_id: hubId,
    run_id: runId,
    created_at: createdAt,
    scoring_version: "v2",
    window_start: "2021-11-25",
    window_end: windowEnd,
    overall_score: "50.00",
    risk_level: "medium",
    top_hazard: "hurricane",
    confidence: "high",
    hazard_scores: { weightedAverage: 50, hazards: Object.fromEntries(HAZARDS.map((h) => [h, hazard(h)])), observedPerYear: null, coverage: null },
  };
}

/**
 * A reader over an in-memory table.
 * @param rows - every stored row, newest run first.
 * @param activeHubIds - the active hubs.
 * @returns the reader.
 */
function reader(rows: ReturnType<typeof row>[], activeHubIds: string[]): LatestSnapshotReader {
  return {
    newestRunId: async () => rows[0]?.run_id ?? null,
    runRows: async (runId) => rows.filter((r) => r.run_id === runId),
    activeHubIds: async () => activeHubIds,
    latestRowForHub: vi.fn(async (hubId: string) => rows.find((r) => r.hub_id === hubId) ?? null),
  };
}

describe("loadLatestSnapshots (latest per hub)", () => {
  it("returns null when nothing is scored yet", async () => {
    await expect(loadLatestSnapshots(reader([], ["dallas"]))).resolves.toBeNull();
  });

  it("keeps a hub that failed in the newest run, with its own older snapshot (a partial run)", async () => {
    const rows = [
      row("miami", "run-2", "2026-11-25T06:05:00Z", "2026-11-24"),
      row("boston", "run-2", "2026-11-25T06:05:00Z", "2026-11-24"),
      row("dallas", "run-1", "2026-11-24T06:05:00Z", "2026-11-23"), // dallas failed in run-2
      row("miami", "run-1", "2026-11-24T06:05:00Z", "2026-11-23"),
    ];
    const r = reader(rows, ["boston", "dallas", "miami"]);
    const snapshots = (await loadLatestSnapshots(r))!;
    expect(snapshots.map((s) => [s.hubId, s.runId, s.window.end])).toEqual([
      ["boston", "run-2", "2026-11-24"],
      ["dallas", "run-1", "2026-11-23"], // carried over, and visibly older
      ["miami", "run-2", "2026-11-24"],
    ]);
    expect(snapshots[1].createdAt).toBe("2026-11-24T06:05:00Z");
    expect(snapshots[0].overallScore).toBe(50); // numeric columns are coerced
    expect(r.latestRowForHub).toHaveBeenCalledTimes(1); // only the missing hub is looked up
  });

  it("leaves out an active hub that was never scored", async () => {
    const snapshots = await loadLatestSnapshots(reader([row("miami", "run-1", "2026-11-25T06:05:00Z", "2026-11-24")], ["miami", "new-hub"]));
    expect(snapshots!.map((s) => s.hubId)).toEqual(["miami"]);
  });

  it("rejects a stored row that doesn't match the scoring schema", async () => {
    const broken = { ...row("miami", "run-1", "2026-11-25T06:05:00Z", "2026-11-24"), top_hazard: "volcano" };
    await expect(loadLatestSnapshots(reader([broken], ["miami"]))).rejects.toThrow(/SnapshotValidationError/);
  });
});
