/**
 * @module core/agent/context
 *
 * Everything one agent turn needs, loaded ONCE per request (36 hubs + their
 * latest snapshots is small), so tools answer from memory instead of hitting
 * the database per call. Only weather stats read rows on demand.
 */
import type { StoredSnapshot } from "../db/scoresRepository";
import type { Hub } from "../domain/hub";
import type { DailyWeather } from "../domain/weather";
import { BoundaryError } from "../errors/boundaryError";
import { riskLevelFor } from "../scoring/overall";
import { HAZARDS, type Hazard, type RiskLevel } from "../scoring/types";
import type { DataBounds } from "../stats/weatherStats";
import type { UnitSystem } from "../utils/units";
import type { HubLevels } from "./finalizeAnswer";

/** Per-request data and settings for the agent. */
export interface AgentContext {
  hubs: Hub[];
  hubById: Map<string, Hub>;
  snapshotByHub: Map<string, StoredSnapshot>;
  levelsByHub: Map<string, HubLevels>;
  weatherBounds: DataBounds;
  /** Today's date `YYYY-MM-DD` (UTC). "Last year" is derived from it (G11). */
  today: string;
  units: UnitSystem;
  getWeatherDays: (hubId: string, startDate: string, endDate: string) => Promise<DailyWeather[]>;
}

/** Where the context comes from (injectable for tests). */
export interface AgentContextDeps {
  listActiveHubs: () => Promise<Hub[]>;
  getLatestSnapshots: () => Promise<StoredSnapshot[] | null>;
  getWeatherBounds: () => Promise<DataBounds | null>;
  getWeatherDays: AgentContext["getWeatherDays"];
}

/**
 * Real levels per hub: overall, and each hazard's score mapped with the same cut-offs.
 * @param snapshot - a hub's latest snapshot.
 * @returns the levels.
 */
export function levelsOf(snapshot: StoredSnapshot): HubLevels {
  return {
    overall: snapshot.riskLevel,
    hazards: Object.fromEntries(HAZARDS.map((h) => [h, riskLevelFor(snapshot.hazards[h].score)])) as Record<Hazard, RiskLevel>,
  };
}

/**
 * Loads the context for one turn.
 * @param deps - data sources.
 * @param options - today's date and the user's unit system.
 * @returns the context.
 * @throws BoundaryError (database) when nothing has been scored or ingested yet.
 */
export async function loadAgentContext(
  deps: AgentContextDeps,
  options: { today: string; units: UnitSystem },
): Promise<AgentContext> {
  const [hubs, snapshots, weatherBounds] = await Promise.all([
    deps.listActiveHubs(),
    deps.getLatestSnapshots(),
    deps.getWeatherBounds(),
  ]);
  if (!snapshots || !weatherBounds) {
    throw new BoundaryError({
      name: "NoDataError",
      message: "No scores or weather data yet — run `npm run ingest` first",
      functionName: "loadAgentContext",
      boundary: "database",
    });
  }
  const active = new Set(hubs.map((h) => h.id));
  const scored = snapshots.filter((s) => active.has(s.hubId));
  return {
    hubs,
    hubById: new Map(hubs.map((h) => [h.id, h])),
    snapshotByHub: new Map(scored.map((s) => [s.hubId, s])),
    levelsByHub: new Map(scored.map((s) => [s.hubId, levelsOf(s)])),
    weatherBounds,
    today: options.today,
    units: options.units,
    getWeatherDays: deps.getWeatherDays,
  };
}
