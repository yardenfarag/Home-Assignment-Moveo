import { describe, expect, it, vi } from "vitest";
import type { FemaCountyRecord } from "../data/femaNri";
import type { Hub } from "../domain/hub";
import { runIngest, type IngestDeps } from "./runIngest";

const hub = (id: string): Hub => ({
  id,
  name: id.toUpperCase(),
  state: "TX",
  region: "South",
  latitude: 32.7,
  longitude: -96.8,
  timezone: "America/Chicago",
  countyFips: null,
  countyName: null,
  isActive: true,
});

const femaRecord = { countyFips: "48113", countyName: "Dallas", stateCode: "TX", nriVersion: "December 2025" } as FemaCountyRecord;

function makeDeps(overrides: Partial<IngestDeps> = {}): IngestDeps {
  return {
    listActiveHubs: vi.fn(async () => [hub("dallas"), hub("houston")]),
    listHubIdsWithFema: vi.fn(async () => new Set(["houston"])),
    fetchFemaCountyByPoint: vi.fn(async () => femaRecord),
    saveFemaRecord: vi.fn(async () => {}),
    getLatestWeatherDate: vi.fn(async (id: string) => (id === "houston" ? "2026-11-24" : null)),
    fetchDailyWeather: vi.fn(async () => [
      { date: "2026-11-24", snowfallCm: 0, tempMinC: 5, precipitationMm: 0, windGustMaxKmh: 20, apparentTempMaxC: 15 },
    ]),
    upsertWeatherDays: vi.fn(async (_id, days) => days.length),
    waitForWeatherQuota: vi.fn(async () => {}),
    recordEvent: vi.fn(async () => true),
    today: () => "2026-11-25",
    log: () => {},
    ...overrides,
  };
}

describe("runIngest", () => {
  it("fetches FEMA only where missing and plans weather per hub", async () => {
    const deps = makeDeps();
    const summary = await runIngest({ trigger: "cli" }, deps);

    expect(deps.fetchFemaCountyByPoint).toHaveBeenCalledTimes(1); // only dallas
    expect(summary.results.map((r) => r.weatherRange)).toEqual([
      { startDate: "2021-01-01", endDate: "2026-11-24" }, // dallas: full history
      { startDate: "2026-11-18", endDate: "2026-11-24" }, // houston: last 7 days
    ]);
    expect(deps.waitForWeatherQuota).toHaveBeenCalledWith(2154);
    expect(summary).toMatchObject({ hubsProcessed: 2, hubsFailed: 0, femaRecordsSaved: 1, weatherRowsSaved: 2 });
  });

  it("records a failure and continues with the next hub", async () => {
    const deps = makeDeps({
      fetchDailyWeather: vi
        .fn()
        .mockRejectedValueOnce(new Error("OpenMeteoFetchError || HTTP 500 || fetchDailyWeather || 🐸"))
        .mockResolvedValueOnce([]),
    });
    const summary = await runIngest({ trigger: "cli" }, deps);

    expect(summary.hubsFailed).toBe(1);
    expect(summary.results[0].error).toContain("HTTP 500");
    expect(summary.results[1].error).toBeUndefined();
    const eventTypes = vi.mocked(deps.recordEvent).mock.calls.map(([event]) => event.eventType);
    expect(eventTypes).toEqual(["ingest.started", "ingest.fema_saved", "ingest.hub_failed", "ingest.weather_saved", "ingest.finished"]);
  });

  it("uses one correlation id for every event of the run", async () => {
    const deps = makeDeps();
    const summary = await runIngest({ trigger: "cron" }, deps);
    const ids = new Set(vi.mocked(deps.recordEvent).mock.calls.map(([event]) => event.correlationId));
    expect(ids).toEqual(new Set([summary.runId]));
  });

  it("re-fetches FEMA for every hub when refreshFema is set", async () => {
    const deps = makeDeps();
    const summary = await runIngest({ trigger: "cli", refreshFema: true }, deps);
    expect(deps.fetchFemaCountyByPoint).toHaveBeenCalledTimes(2); // houston too, although it had a record
    expect(summary.femaRecordsSaved).toBe(2);
  });

  it("can be limited to specific hubs", async () => {
    const deps = makeDeps();
    const summary = await runIngest({ trigger: "cli", hubIds: ["houston", "atlantis"] }, deps);
    expect(summary.results.map((r) => r.hubId)).toEqual(["houston"]);
  });
});
