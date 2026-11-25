/**
 * @module core/agent/testFixtures
 *
 * Shared test data: one real, deterministic Dallas-like hub score and an agent context around it.
 */
import type { StoredSnapshot } from "../db/scoresRepository";
import { CENSUS_REGIONS, type Hub } from "../domain/hub";
import type { DailyWeather } from "../domain/weather";
import { scoreHub } from "../scoring/scoreHub";
import { HAZARDS } from "../scoring/types";
import { addDays } from "../utils/dates";
import { levelsOf, type AgentContext } from "./context";

/** A Dallas-like hub. */
export const dallas: Hub = {
  id: "dallas",
  name: "Dallas",
  state: "TX",
  region: "South",
  latitude: 32.7,
  longitude: -96.8,
  timezone: "America/Chicago",
  countyFips: "48113",
  countyName: "Dallas",
  isActive: true,
};

/** A real, deterministic Dallas-like score (hail-heavy, hot). */
export const score = scoreHub(
  {
    window: { start: "2021-11-25", end: "2026-11-24" },
    expectedDays: 1826,
    coverage: { snowfall: 1, tempMin: 1, precipitation: 1, windGust: 1, apparentTempMax: 1 },
    perYear: { snowDays: 1.2, heavySnowDays: 0, extremeColdDays: 0, heavyRainDays: 2.8, gustAdvisoryDays: 4.2, gustWarningDays: 0.2, extremeHeatDays: 41 },
  },
  {
    countyAreaSqMi: 918,
    hurricane: 0.0115,
    tornado: 0.928,
    hail: 8.92,
    inlandFlood: 4.61,
    coastalFlood: null,
    iceStorm: 1.23,
    winterWeather: 4.05,
    coldWave: 0.95,
    heatWave: 19.1,
    strongWind: 4.36,
  },
);
/** Its stored score snapshot. */
export const snapshot: StoredSnapshot = {
  ...score,
  hubId: "dallas",
  runId: "run-1",
  createdAt: "2026-11-25T00:00:00Z",
  window: { start: "2021-11-25", end: "2026-11-24" },
  observedPerYear: null,
  coverage: null,
};

/** An agent context with just that hub. */
export const ctx: AgentContext = {
  hubs: [dallas],
  hubById: new Map([["dallas", dallas]]),
  snapshotByHub: new Map([["dallas", snapshot]]),
  levelsByHub: new Map([["dallas", levelsOf(snapshot)]]),
  weatherBounds: { earliest: "2021-01-01", latest: "2026-11-24" },
  today: "2026-11-25",
  units: "us",
  getWeatherDays: async () => [],
};

/**
 * Every day from `start` to `end` with complete weather, snowing on the 1st and 15th of each month
 * (so a stat over any period has full coverage and some hazard days).
 * @param start - first day, `YYYY-MM-DD`.
 * @param end - last day, `YYYY-MM-DD`.
 * @returns the daily rows.
 */
export function completeWeatherDays(start: string, end: string): DailyWeather[] {
  const days: DailyWeather[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const snowy = date.endsWith("-01") || date.endsWith("-15");
    days.push({ date, snowfallCm: snowy ? 2 : 0, tempMinC: 5, precipitationMm: 1, windGustMaxKmh: 30, apparentTempMaxC: 20 });
  }
  return days;
}

/**
 * A context with `count` Dallas-like hubs (ids `hub-01`…), spread over the four Census regions,
 * with varied scores and every fourth hub's wind at medium confidence (the sources disagree) —
 * close enough to the live 36 hubs to measure how big tool results get.
 * @param count - how many hubs.
 * @returns the context (its weather has complete data for every day).
 */
export function manyHubsContext(count: number): AgentContext {
  const hubs: Hub[] = [];
  const snapshots: StoredSnapshot[] = [];
  for (let i = 0; i < count; i++) {
    const id = `hub-${String(i + 1).padStart(2, "0")}`;
    hubs.push({ ...dallas, id, name: `City ${i + 1}`, region: CENSUS_REGIONS[i % CENSUS_REGIONS.length] });
    /** Scales a score down a little per hub, so hubs don't all tie. */
    const vary = (value: number) => Math.round(value * (1 - i / (2 * count)) * 10) / 10;
    const hazards = Object.fromEntries(
      HAZARDS.map((h) => [h, { ...snapshot.hazards[h], score: vary(snapshot.hazards[h].score) }]),
    ) as StoredSnapshot["hazards"];
    if (i % 4 === 0) {
      hazards.wind = {
        ...hazards.wind,
        confidence: "medium",
        confidenceReason: "The two sources disagree: observed weather scores 42, FEMA's long-term county record scores 70 on the same phenomenon.",
      };
    }
    snapshots.push({ ...snapshot, hubId: id, overallScore: vary(snapshot.overallScore), hazards });
  }
  return {
    hubs,
    hubById: new Map(hubs.map((h) => [h.id, h])),
    snapshotByHub: new Map(snapshots.map((s) => [s.hubId, s])),
    levelsByHub: new Map(snapshots.map((s) => [s.hubId, levelsOf(s)])),
    weatherBounds: { earliest: "2021-01-01", latest: "2026-11-24" },
    today: "2026-11-25",
    units: "us",
    getWeatherDays: async (_hubId, start, end) => completeWeatherDays(start, end),
  };
}
