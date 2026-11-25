/**
 * @module core/ingest/createIngestDeps
 *
 * Wires the real implementations (Supabase, Open-Meteo, FEMA, rate limiter)
 * into {@link IngestDeps}. Used by the CLI script and, later, the cron route.
 */
import { OPEN_METEO_LIMITS } from "../config/ingestConfig";
import { fetchFemaCountyByPoint } from "../data/femaNri";
import { estimateCallWeight, fetchDailyWeather } from "../data/openMeteo";
import { recordEvent } from "../db/eventsRepository";
import { listHubIdsWithFema, saveFemaRecord } from "../db/femaRepository";
import { listActiveHubs } from "../db/hubsRepository";
import { getLatestWeatherDate, upsertWeatherDays } from "../db/weatherRepository";
import { toIsoDate } from "../utils/dates";
import { WeightedRateLimiter } from "./rateLimiter";
import type { IngestDeps } from "./runIngest";

/**
 * Builds production dependencies for {@link runIngest}.
 * @param log - where progress lines go.
 * @returns the dependencies.
 */
export function createIngestDeps(log: (line: string) => void): IngestDeps {
  const limiter = new WeightedRateLimiter(OPEN_METEO_LIMITS, Date.now, undefined, (ms) =>
    log(`   ⏳ pausing ${Math.ceil(ms / 1000)}s to respect Open-Meteo rate limits`),
  );
  return {
    listActiveHubs: () => listActiveHubs(),
    listHubIdsWithFema: () => listHubIdsWithFema(),
    fetchFemaCountyByPoint: (latitude, longitude) => fetchFemaCountyByPoint(latitude, longitude),
    saveFemaRecord: (hubId, record) => saveFemaRecord(hubId, record),
    getLatestWeatherDate: (hubId) => getLatestWeatherDate(hubId),
    fetchDailyWeather: (request) => fetchDailyWeather(request),
    upsertWeatherDays: (hubId, days) => upsertWeatherDays(hubId, days),
    waitForWeatherQuota: async (days) => {
      await limiter.acquire(estimateCallWeight(days));
    },
    recordEvent: (event) => recordEvent(event),
    today: () => toIsoDate(new Date()),
    log,
  };
}
