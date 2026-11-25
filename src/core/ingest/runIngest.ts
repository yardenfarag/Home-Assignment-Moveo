/**
 * @module core/ingest/runIngest
 *
 * Runs one ingest pass over the active hubs:
 *   1. FEMA NRI county record — only for hubs that don't have one yet.
 *   2. Open-Meteo daily weather — only the missing days + the last 7 (see planWeatherRange).
 * Every step is written to the `events` table under one run id (correlation id).
 * One hub failing never stops the others.
 *
 * All I/O is injected, so this can be tested with fakes and reused by the
 * CLI script and the (Step 5) cron route.
 */
import { randomUUID } from "node:crypto";
import { REFETCH_RECENT_DAYS, WEATHER_HISTORY_START } from "../config/ingestConfig";
import type { FemaCountyRecord } from "../data/femaNri";
import type { ArchiveRequest } from "../data/openMeteo";
import type { NewEvent } from "../db/eventsRepository";
import type { Hub } from "../domain/hub";
import type { DailyWeather } from "../domain/weather";
import { describeUnknownError } from "../errors/boundaryError";
import { daysInclusive } from "../utils/dates";
import { planWeatherRange } from "./planWeatherRange";

/** Everything the ingest needs from the outside world. */
export interface IngestDeps {
  listActiveHubs: () => Promise<Hub[]>;
  listHubIdsWithFema: () => Promise<Set<string>>;
  fetchFemaCountyByPoint: (latitude: number, longitude: number) => Promise<FemaCountyRecord>;
  saveFemaRecord: (hubId: string, record: FemaCountyRecord) => Promise<void>;
  getLatestWeatherDate: (hubId: string) => Promise<string | null>;
  fetchDailyWeather: (request: ArchiveRequest) => Promise<DailyWeather[]>;
  upsertWeatherDays: (hubId: string, days: DailyWeather[]) => Promise<number>;
  /** Waits until Open-Meteo allows a request with this many days. */
  waitForWeatherQuota: (days: number) => Promise<void>;
  recordEvent: (event: NewEvent) => Promise<boolean>;
  /** Today's date `YYYY-MM-DD` (UTC). */
  today: () => string;
  /** Progress output (console in the CLI). */
  log: (line: string) => void;
}

/** Options for one run. */
export interface IngestOptions {
  /** Limit the run to these hub ids (default: all active hubs). */
  hubIds?: string[];
  /** Who triggered the run, stored on events. */
  trigger: "cli" | "cron";
  /** Re-fetch FEMA records even for hubs that already have one (e.g. a new NRI version, or a new field). */
  refreshFema?: boolean;
}

/** What happened to one hub. */
export interface HubIngestResult {
  hubId: string;
  femaFetched: boolean;
  weatherRange: { startDate: string; endDate: string } | null;
  weatherRowsSaved: number;
  error?: string;
}

/** Summary of a whole run. */
export interface IngestSummary {
  runId: string;
  hubsProcessed: number;
  hubsFailed: number;
  weatherRowsSaved: number;
  femaRecordsSaved: number;
  results: HubIngestResult[];
}

/**
 * Ingests FEMA + weather data for one hub.
 * @returns what was done.
 * @throws whatever the injected I/O throws (caught by the caller).
 */
async function ingestHub(
  hub: Hub,
  hasFema: boolean,
  runId: string,
  deps: IngestDeps,
  result: HubIngestResult,
): Promise<void> {
  if (!hasFema) {
    const record = await deps.fetchFemaCountyByPoint(hub.latitude, hub.longitude);
    await deps.saveFemaRecord(hub.id, record);
    result.femaFetched = true;
    await deps.recordEvent({
      eventType: "ingest.fema_saved",
      source: "ingest",
      correlationId: runId,
      hubId: hub.id,
      message: `${record.countyName} County, ${record.stateCode} (${record.countyFips})`,
      payload: { countyFips: record.countyFips, nriVersion: record.nriVersion },
    });
  }

  const range = planWeatherRange({
    latestStoredDate: await deps.getLatestWeatherDate(hub.id),
    today: deps.today(),
    historyStart: WEATHER_HISTORY_START,
    refetchRecentDays: REFETCH_RECENT_DAYS,
  });
  result.weatherRange = range;
  if (!range) return;

  await deps.waitForWeatherQuota(daysInclusive(range.startDate, range.endDate));
  const days = await deps.fetchDailyWeather({
    latitude: hub.latitude,
    longitude: hub.longitude,
    timezone: hub.timezone,
    ...range,
  });
  result.weatherRowsSaved = await deps.upsertWeatherDays(hub.id, days);
  await deps.recordEvent({
    eventType: "ingest.weather_saved",
    source: "ingest",
    correlationId: runId,
    hubId: hub.id,
    message: `${result.weatherRowsSaved} days ${range.startDate}..${range.endDate}`,
    payload: { ...range, rows: result.weatherRowsSaved },
  });
}

/**
 * Runs one ingest pass.
 * @param options - which hubs and who triggered it.
 * @param deps - injected I/O.
 * @returns the run summary (also stored as the `ingest.finished` event).
 * @throws only if the hub list itself can't be read; per-hub failures are recorded and skipped.
 */
export async function runIngest(options: IngestOptions, deps: IngestDeps): Promise<IngestSummary> {
  const runId = randomUUID();
  const startedAt = Date.now();
  await deps.recordEvent({
    eventType: "ingest.started",
    source: "ingest",
    correlationId: runId,
    payload: { trigger: options.trigger, hubIds: options.hubIds ?? "all", refreshFema: options.refreshFema ?? false },
  });

  const allHubs = await deps.listActiveHubs();
  const hubs = options.hubIds ? allHubs.filter((hub) => options.hubIds!.includes(hub.id)) : allHubs;
  const unknown = (options.hubIds ?? []).filter((id) => !allHubs.some((hub) => hub.id === id));
  if (unknown.length > 0) deps.log(`⚠️  Unknown or inactive hub ids skipped: ${unknown.join(", ")}`);

  const withFema = options.refreshFema ? new Set<string>() : await deps.listHubIdsWithFema();
  const results: HubIngestResult[] = [];

  for (const [index, hub] of hubs.entries()) {
    const result: HubIngestResult = { hubId: hub.id, femaFetched: false, weatherRange: null, weatherRowsSaved: 0 };
    try {
      await ingestHub(hub, withFema.has(hub.id), runId, deps, result);
      const range = result.weatherRange ? `${result.weatherRange.startDate}..${result.weatherRange.endDate}` : "up to date";
      deps.log(
        `[${index + 1}/${hubs.length}] ✅ ${hub.name}: ${result.weatherRowsSaved} days (${range})${result.femaFetched ? " + FEMA" : ""}`,
      );
    } catch (error) {
      result.error = describeUnknownError(error);
      deps.log(`[${index + 1}/${hubs.length}] ❌ ${hub.name}: ${result.error}`);
      await deps.recordEvent({
        eventType: "ingest.hub_failed",
        source: "ingest",
        level: "error",
        correlationId: runId,
        hubId: hub.id,
        message: result.error,
      });
    }
    results.push(result);
  }

  const summary: IngestSummary = {
    runId,
    hubsProcessed: results.length,
    hubsFailed: results.filter((r) => r.error).length,
    weatherRowsSaved: results.reduce((sum, r) => sum + r.weatherRowsSaved, 0),
    femaRecordsSaved: results.filter((r) => r.femaFetched).length,
    results,
  };
  await deps.recordEvent({
    eventType: "ingest.finished",
    source: "ingest",
    level: summary.hubsFailed > 0 ? "warn" : "info",
    correlationId: runId,
    message: `${summary.hubsProcessed} hubs, ${summary.hubsFailed} failed, ${summary.weatherRowsSaved} weather rows, ${summary.femaRecordsSaved} FEMA records`,
    payload: {
      durationMs: Date.now() - startedAt,
      hubsProcessed: summary.hubsProcessed,
      hubsFailed: summary.hubsFailed,
      weatherRowsSaved: summary.weatherRowsSaved,
      femaRecordsSaved: summary.femaRecordsSaved,
      failedHubIds: results.filter((r) => r.error).map((r) => r.hubId),
    },
  });
  return summary;
}
