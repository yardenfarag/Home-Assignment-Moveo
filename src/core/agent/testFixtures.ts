/**
 * @module core/agent/testFixtures
 *
 * Shared test data: one real, deterministic Dallas-like hub score and an agent context around it.
 */
import type { StoredSnapshot } from "../db/scoresRepository";
import type { Hub } from "../domain/hub";
import { scoreHub } from "../scoring/scoreHub";
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
