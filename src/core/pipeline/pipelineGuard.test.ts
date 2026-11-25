import { describe, expect, it, vi } from "vitest";
import { PIPELINE_TIMING } from "../config/timeouts";
import type { StoredEvent } from "../db/eventsRepository";
import { decidePipelineGuard, pipelineGuardStatus } from "./pipelineGuard";

const now = new Date("2026-11-25T06:05:00Z");

/**
 * A stored run event.
 * @param eventType - `ingest.started` or `scoring.finished`.
 * @param runId - the run's correlation id.
 * @param minutesAgo - how long before `now`.
 * @returns the event.
 */
const event = (eventType: string, runId: string, minutesAgo: number): StoredEvent => ({
  id: `${eventType}-${runId}`,
  eventType,
  correlationId: runId,
  hubId: null,
  message: null,
  payload: {},
  createdAt: new Date(now.getTime() - minutesAgo * 60_000).toISOString(),
});

describe("decidePipelineGuard", () => {
  it("allows a run when nothing is in progress", () => {
    expect(decidePipelineGuard([], [], now)).toEqual({ allowed: true, runningRunId: null, runningSince: null });
  });

  it("blocks while a run has started but not finished scoring", () => {
    const status = decidePipelineGuard([event("ingest.started", "run-1", 2)], [], now);
    expect(status).toMatchObject({ allowed: false, runningRunId: "run-1" });
  });

  it("allows a run once the earlier one has finished", () => {
    expect(decidePipelineGuard([event("ingest.started", "run-1", 4)], [event("scoring.finished", "run-1", 1)], now).allowed).toBe(true);
  });

  it("treats a start older than the lock window as abandoned (a crashed or killed run)", () => {
    const old = event("ingest.started", "run-1", PIPELINE_TIMING.lockMinutes + 1);
    expect(decidePipelineGuard([old], [], now).allowed).toBe(true);
  });

  it("keeps the lock longer than the cron route may run", () => {
    expect(PIPELINE_TIMING.lockMinutes * 60).toBeGreaterThan(PIPELINE_TIMING.cronMaxDurationS);
  });
});

describe("pipelineGuardStatus", () => {
  it("reads both event types since the lock window began", async () => {
    const listEvents = vi.fn(async ({ eventType }: { eventType: string }) => (eventType === "ingest.started" ? [event("ingest.started", "run-9", 1)] : []));
    const status = await pipelineGuardStatus({ listEvents, now: () => now });
    expect(status.runningRunId).toBe("run-9");
    expect(listEvents).toHaveBeenCalledWith({ eventType: "ingest.started", since: "2026-11-25T05:55:00.000Z", limit: 20 });
    expect(listEvents).toHaveBeenCalledWith({ eventType: "scoring.finished", since: "2026-11-25T05:55:00.000Z", limit: 20 });
  });
});
