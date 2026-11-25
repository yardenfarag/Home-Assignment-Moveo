import { describe, expect, it, vi } from "vitest";
import type { StoredEvent } from "../db/eventsRepository";
import type { IngestDeps } from "../ingest/runIngest";
import type { ScoringDeps } from "../scoring/runScoring";
import { runIngestThenScore, type PipelineDeps } from "./runIngestThenScore";

const now = new Date("2026-11-25T06:05:00Z");

/** A start event of a run that is still going (2 minutes old, no finish). */
const runningStart: StoredEvent = {
  id: "1",
  eventType: "ingest.started",
  correlationId: "run-busy",
  hubId: null,
  message: null,
  payload: {},
  createdAt: "2026-11-25T06:03:00.000Z",
};

/**
 * Pipeline deps with no hubs, so a run that goes ahead does nothing but record events.
 * @param listEvents - what the guard reads.
 * @returns the deps.
 */
function makeDeps(listEvents: PipelineDeps["guard"]["listEvents"]): PipelineDeps {
  const recordEvent = vi.fn(async () => true);
  const ingest: IngestDeps = {
    listActiveHubs: vi.fn(async () => []),
    listHubIdsWithFema: async () => new Set<string>(),
    fetchFemaCountyByPoint: vi.fn(),
    saveFemaRecord: vi.fn(),
    getLatestWeatherDate: vi.fn(),
    fetchDailyWeather: vi.fn(),
    upsertWeatherDays: vi.fn(),
    waitForWeatherQuota: vi.fn(),
    recordEvent,
    now: () => now,
    log: vi.fn(),
  };
  const scoring: ScoringDeps = {
    listActiveHubs: async () => [],
    getLatestWeatherDate: vi.fn(),
    getWeatherDays: vi.fn(),
    getFemaSignalsByHub: async () => ({ signals: new Map(), problems: new Map() }),
    saveScoreSnapshots: async () => 0,
    getLatestSnapshots: async () => null,
    recordEvent,
    log: vi.fn(),
  };
  return { ingest, scoring, guard: { listEvents, now: () => now } };
}

describe("runIngestThenScore overlap guard", () => {
  it("skips the run, logs it and records why, while another run is in progress", async () => {
    const deps = makeDeps(async ({ eventType }) => (eventType === "ingest.started" ? [runningStart] : []));
    const result = await runIngestThenScore({ trigger: "cron" }, deps);

    expect(result).toEqual({ status: "skipped", runningRunId: "run-busy", runningSince: runningStart.createdAt });
    expect(deps.ingest.listActiveHubs).not.toHaveBeenCalled();
    expect(deps.ingest.log).toHaveBeenCalledWith(expect.stringMatching(/^PipelineAlreadyRunning \|\| Another pipeline run \(run-busy.* \|\| runIngestThenScore \|\| 🐘$/));
    expect(vi.mocked(deps.ingest.recordEvent).mock.calls.map(([e]) => e.eventType)).toEqual(["ingest.skipped_overlap"]);
  });

  it("runs ingest then scoring under one run id when nothing else is running", async () => {
    const deps = makeDeps(async () => []);
    const result = await runIngestThenScore({ trigger: "cron" }, deps);
    expect(result.status).toBe("ran");
    if (result.status === "ran") expect(result.scoring.runId).toBe(result.ingest.runId);
  });

  it("goes ahead (and logs it) when the guard can't read the events", async () => {
    const deps = makeDeps(async () => {
      throw new Error("db down");
    });
    const result = await runIngestThenScore({ trigger: "cli" }, deps);
    expect(result.status).toBe("ran");
    expect(deps.ingest.log).toHaveBeenCalledWith(expect.stringMatching(/^PipelineGuardError \|\| Could not check for a run in progress, so starting anyway: db down/));
  });
});
