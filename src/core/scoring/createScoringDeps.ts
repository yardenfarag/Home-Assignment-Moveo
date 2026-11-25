/**
 * @module core/scoring/createScoringDeps
 *
 * Wires the real Supabase repositories into {@link ScoringDeps}.
 */
import { recordEvent } from "../db/eventsRepository";
import { getFemaSignalsByHub } from "../db/femaRepository";
import { listActiveHubs } from "../db/hubsRepository";
import { getLatestSnapshots, saveScoreSnapshots } from "../db/scoresRepository";
import { getLatestWeatherDate, getWeatherDays } from "../db/weatherRepository";
import type { ScoringDeps } from "./runScoring";

/**
 * Builds production dependencies for {@link runScoring}.
 * @param log - where progress lines go.
 * @returns the dependencies.
 */
export function createScoringDeps(log: (line: string) => void): ScoringDeps {
  return {
    listActiveHubs: () => listActiveHubs(),
    getLatestWeatherDate: (hubId) => getLatestWeatherDate(hubId),
    getWeatherDays: (hubId, start, end) => getWeatherDays(hubId, start, end),
    getFemaSignalsByHub: () => getFemaSignalsByHub(),
    saveScoreSnapshots: (snapshots) => saveScoreSnapshots(snapshots),
    getLatestSnapshots: () => getLatestSnapshots(),
    recordEvent: (event) => recordEvent(event),
    log,
  };
}
