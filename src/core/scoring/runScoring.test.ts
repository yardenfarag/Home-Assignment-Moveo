import { describe, expect, it, vi } from "vitest";
import type { Hub } from "../domain/hub";
import type { DailyWeather } from "../domain/weather";
import { runScoring, type ScoringDeps } from "./runScoring";
import type { StoredSnapshot } from "../db/scoresRepository";
import type { FemaSignals } from "./types";

const hub = (id: string): Hub => ({
  id,
  name: id,
  state: "FL",
  region: "South",
  latitude: 25.7,
  longitude: -80.2,
  timezone: "America/New_York",
  countyFips: null,
  countyName: null,
  isActive: true,
});

const fema: FemaSignals = {
  countyAreaSqMi: 1000,
  hurricane: 0.305,
  tornado: 0,
  hail: 0,
  inlandFlood: 0,
  coastalFlood: null,
  iceStorm: null,
  winterWeather: 0,
  coldWave: 0,
  heatWave: 0,
  strongWind: 0,
};

const calmDay = (date: string): DailyWeather => ({
  date,
  snowfallCm: 0,
  tempMinC: 20,
  precipitationMm: 0,
  windGustMaxKmh: 20,
  apparentTempMaxC: 30,
});

function makeDeps(overrides: Partial<ScoringDeps> = {}): ScoringDeps {
  return {
    listActiveHubs: vi.fn(async () => [hub("miami"), hub("ghost")]),
    getLatestWeatherDate: vi.fn(async (id: string) => (id === "miami" ? "2026-11-24" : null)),
    getWeatherDays: vi.fn(async () => [calmDay("2026-11-23"), calmDay("2026-11-24")]),
    getFemaSignalsByHub: vi.fn(async () => ({ signals: new Map([["miami", fema]]), problems: new Map() })),
    saveScoreSnapshots: vi.fn(async (rows) => rows.length),
    getLatestSnapshots: vi.fn(async () => null),
    recordEvent: vi.fn(async () => true),
    log: () => {},
    ...overrides,
  };
}

describe("runScoring", () => {
  it("scores each hub with data, skips hubs without weather, and saves in one write", async () => {
    const deps = makeDeps();
    const summary = await runScoring({ trigger: "cli" }, deps);

    expect(summary.hubsScored).toBe(1);
    expect(summary.hubsFailed).toBe(1);
    expect(summary.results.find((r) => r.hubId === "ghost")?.error).toMatch(/no weather data/);
    expect(deps.saveScoreSnapshots).toHaveBeenCalledTimes(1);
    const [saved] = vi.mocked(deps.saveScoreSnapshots).mock.calls[0];
    expect(saved[0].hubId).toBe("miami");
    expect(saved[0].window).toEqual({ start: "2021-11-25", end: "2026-11-24" });
    expect(saved[0].score.hazards.hurricane.score).toBe(100);
  });

  it("reuses the ingest run id when given one (one correlation id end to end)", async () => {
    const deps = makeDeps();
    const summary = await runScoring({ trigger: "cli", runId: "11111111-1111-4111-8111-111111111111" }, deps);
    expect(summary.runId).toBe("11111111-1111-4111-8111-111111111111");
    const ids = new Set(vi.mocked(deps.recordEvent).mock.calls.map(([event]) => event.correlationId));
    expect(ids).toEqual(new Set([summary.runId]));
  });

  it("reports FEMA rows that can't be used, but still scores the hub (confidence drops)", async () => {
    const deps = makeDeps({
      getFemaSignalsByHub: vi.fn(async () => ({ signals: new Map(), problems: new Map([["miami", "no county area"]]) })),
    });
    const summary = await runScoring({ trigger: "cli" }, deps);
    const miami = summary.results.find((r) => r.hubId === "miami")!;
    expect(miami.warning).toMatch(/no county area/);
    expect(miami.confidence).toBe("low");
  });

  it("logs and records an unusable FEMA row instead of dropping it silently", async () => {
    const lines: string[] = [];
    const deps = makeDeps({
      getFemaSignalsByHub: vi.fn(async () => ({ signals: new Map(), problems: new Map([["miami", "no county area"]]) })),
      log: (line) => lines.push(line),
    });
    await runScoring({ trigger: "cli" }, deps);
    expect(lines).toContain("   ⚠️  ScoringDataWarning || miami: unusable FEMA record (no county area) || runScoring || 🐘");
    const events = vi.mocked(deps.recordEvent).mock.calls.map(([e]) => e);
    expect(events.find((e) => e.eventType === "scoring.hub_warning" && e.hubId === "miami")).toMatchObject({ level: "warn", message: "unusable FEMA record (no county area)" });
    const finished = events.find((e) => e.eventType === "scoring.finished")!;
    expect(finished.level).toBe("warn");
    expect(finished.payload).toMatchObject({ warnings: expect.arrayContaining([{ hubId: "miami", warning: "unusable FEMA record (no county area)" }]) });
  });

  it("logs a plain per-hub error in the boundary format", async () => {
    const lines: string[] = [];
    await runScoring({ trigger: "cli" }, makeDeps({ log: (line) => lines.push(line) }));
    expect(lines).toContain("   ❌ ghost: Error || no weather data stored yet (run the ingest first) || runScoring || 🐘");
  });

  it("warns about a hub whose weather ends days before the other hubs'", async () => {
    const deps = makeDeps({
      listActiveHubs: vi.fn(async () => [hub("miami"), hub("tampa")]),
      getLatestWeatherDate: vi.fn(async (id: string) => (id === "miami" ? "2026-11-24" : "2026-11-19")),
      getFemaSignalsByHub: vi.fn(async () => ({ signals: new Map([["miami", fema], ["tampa", fema]]), problems: new Map() })),
    });
    const summary = await runScoring({ trigger: "cli" }, deps);
    expect(summary.results.find((r) => r.hubId === "tampa")?.warning).toBe("weather data ends 2026-11-19, 5 days behind the newest hub");
    expect(summary.results.find((r) => r.hubId === "miami")?.warning).toBeUndefined();
  });
});

describe("runScoring alerts (D124)", () => {
  /** The previous run's Miami result, as getLatestSnapshots would return it. */
  const previousMiami = (overallScore: number, riskLevel: "low" | "medium" | "high") =>
    [{ hubId: "miami", overallScore, riskLevel }] as unknown as StoredSnapshot[];

  it("records an alert when a hub's level changed since the previous run", async () => {
    const deps = makeDeps({ getLatestSnapshots: vi.fn(async () => previousMiami(10, "low")) });
    const summary = await runScoring({ trigger: "cron" }, deps);
    expect(summary.alerts).toBe(1);
    const events = vi.mocked(deps.recordEvent).mock.calls.map(([e]) => e);
    expect(events.find((e) => e.eventType === "alert.score_changed")).toMatchObject({ hubId: "miami", payload: { fromScore: 10, fromLevel: "low", test: false } });
  });

  it("raises no alert for a hub whose FEMA data is missing this run (the drop would be an artifact)", async () => {
    const deps = makeDeps({
      getLatestSnapshots: vi.fn(async () => previousMiami(90, "high")),
      getFemaSignalsByHub: vi.fn(async () => ({ signals: new Map(), problems: new Map([["miami", "no county area"]]) })),
    });
    const summary = await runScoring({ trigger: "cron" }, deps);
    expect(summary.alerts).toBe(0);
    const finished = vi.mocked(deps.recordEvent).mock.calls.map(([e]) => e).find((e) => e.eventType === "scoring.finished")!;
    expect(finished.payload).toMatchObject({ alertsSkippedForMissingFema: ["miami", "ghost"] });
  });

  it("keeps scoring (no alerts) when the previous scores can't be read", async () => {
    const deps = makeDeps({
      getLatestSnapshots: vi.fn(async () => {
        throw new Error("db down");
      }),
    });
    const summary = await runScoring({ trigger: "cron" }, deps);
    expect(summary.hubsScored).toBe(1);
    expect(summary.alerts).toBe(0);
  });
});
