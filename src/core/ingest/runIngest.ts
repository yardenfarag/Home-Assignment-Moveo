/**
 * @module core/ingest/runIngest
 *
 * Runs one ingest pass over the active hubs:
 *   1. FEMA NRI county record — only for hubs that don't have one yet.
 *   2. Open-Meteo daily weather — only the missing days + the last 7 (see planWeatherRange),
 *      up to yesterday in the hub's own timezone.
 * Every step is written to the `events` table under one run id (correlation id).
 * One hub failing never stops the others, and a FEMA failure never stops the hub's weather.
 * With a time budget (the cron route), hubs not started in time are skipped and recorded,
 * so scoring still runs on the data already stored.
 *
 * All I/O is injected, so this can be tested with fakes and reused by the
 * CLI script and the cron route.
 */
import { randomUUID } from "node:crypto";
import { REFETCH_RECENT_DAYS, WEATHER_HISTORY_START } from "../config/ingestConfig";
import type { FemaCountyRecord } from "../data/femaNri";
import type { ArchiveRequest } from "../data/openMeteo";
import type { NewEvent } from "../db/eventsRepository";
import type { Hub } from "../domain/hub";
import type { DailyWeather } from "../domain/weather";
import { boundaryLogLine, describeUnknownError, formatBoundaryMessage } from "../errors/boundaryError";
import { daysInclusive, isoDateInTimeZone } from "../utils/dates";
import { planWeatherRange } from "./planWeatherRange";

/** Per-call options the ingest passes to the external API clients. */
export interface ExternalCallOptions {
  /** Time (ms since epoch) after which no new HTTP attempt starts (from the run's time budget). */
  deadlineAt?: number;
}

/** Everything the ingest needs from the outside world. */
export interface IngestDeps {
  /** The active hubs, ordered by id. */
  listActiveHubs: () => Promise<Hub[]>;
  /** Hub ids that already have a FEMA record (those are not fetched again). */
  listHubIdsWithFema: () => Promise<Set<string>>;
  /** The FEMA NRI record of the county containing a point. */
  fetchFemaCountyByPoint: (latitude: number, longitude: number, options?: ExternalCallOptions) => Promise<FemaCountyRecord>;
  /** Stores a hub's FEMA record (and its county copy on the hub). */
  saveFemaRecord: (hubId: string, record: FemaCountyRecord) => Promise<void>;
  /** The newest stored weather day of a hub, or null. */
  getLatestWeatherDate: (hubId: string) => Promise<string | null>;
  /** Daily weather for one point and date range. */
  fetchDailyWeather: (request: ArchiveRequest, options?: ExternalCallOptions) => Promise<DailyWeather[]>;
  /** Stores weather days; returns how many rows were written. */
  upsertWeatherDays: (hubId: string, days: DailyWeather[]) => Promise<number>;
  /** Waits until Open-Meteo allows a request with this many days. */
  waitForWeatherQuota: (days: number) => Promise<void>;
  /** Records an event (never throws). */
  recordEvent: (event: NewEvent) => Promise<boolean>;
  /** The current time: each hub's "yesterday" is taken in its own timezone, and the time budget is measured with it. */
  now: () => Date;
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
  /**
   * Stop starting new hubs (and new HTTP attempts) after this many ms. Set by the cron route
   * (PIPELINE_TIMING.ingestBudgetMs); unset for the CLI, whose first full load can take hours.
   */
  timeBudgetMs?: number;
}

/** What happened to one hub. */
export interface HubIngestResult {
  /** The hub's slug. */
  hubId: string;
  /** True when a FEMA record was fetched and saved in this run. */
  femaFetched: boolean;
  /** The FEMA step's failure, when it failed (the weather step still ran). */
  femaError?: string;
  /** The weather days requested, or null when already up to date (or not reached). */
  weatherRange: { startDate: string; endDate: string } | null;
  /** How many weather rows were written. */
  weatherRowsSaved: number;
  /** The weather step's failure, when it failed. */
  error?: string;
  /** True when the run's time budget ran out before this hub was started. */
  skipped?: boolean;
}

/** Summary of a whole run. */
export interface IngestSummary {
  /** The run's correlation id (scoring reuses it). */
  runId: string;
  /** Hubs started in this run (skipped ones not counted). */
  hubsProcessed: number;
  /** Hubs with a FEMA or weather failure. */
  hubsFailed: number;
  /** Hubs not started because the time budget ran out. */
  hubsSkipped: number;
  weatherRowsSaved: number;
  femaRecordsSaved: number;
  results: HubIngestResult[];
}

/**
 * Fetches and saves the FEMA record of one hub. A failure is logged and recorded here and
 * never thrown, so the hub's weather step still runs (the FEMA row is retried next run).
 * @param hub - the hub.
 * @param runId - the run's correlation id.
 * @param deps - injected I/O.
 * @param result - the hub's result, updated in place.
 * @param deadlineAt - the run's deadline, if any.
 */
async function ingestFema(hub: Hub, runId: string, deps: IngestDeps, result: HubIngestResult, deadlineAt: number | undefined): Promise<void> {
  try {
    const record = await deps.fetchFemaCountyByPoint(hub.latitude, hub.longitude, { deadlineAt });
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
  } catch (error) {
    result.femaError = describeUnknownError(error);
    deps.log(`   ⚠️  ${hub.name} FEMA step failed, continuing with weather: ${boundaryLogLine(error, "ingestFema", "fema")}`);
    await deps.recordEvent({
      eventType: "ingest.fema_failed",
      source: "ingest",
      level: "error",
      correlationId: runId,
      hubId: hub.id,
      message: result.femaError,
    });
  }
}

/**
 * Fetches and saves the missing (and recent) weather days of one hub, up to yesterday in
 * the hub's timezone (at the 06:00 UTC cron it is still the previous evening out West,
 * so "yesterday in UTC" would be a day that hasn't ended there yet).
 * @param hub - the hub.
 * @param runId - the run's correlation id.
 * @param deps - injected I/O.
 * @param result - the hub's result, updated in place.
 * @param deadlineAt - the run's deadline, if any.
 * @throws whatever the injected I/O throws (caught by the caller).
 */
async function ingestWeather(hub: Hub, runId: string, deps: IngestDeps, result: HubIngestResult, deadlineAt: number | undefined): Promise<void> {
  const range = planWeatherRange({
    latestStoredDate: await deps.getLatestWeatherDate(hub.id),
    today: isoDateInTimeZone(deps.now(), hub.timezone),
    historyStart: WEATHER_HISTORY_START,
    refetchRecentDays: REFETCH_RECENT_DAYS,
  });
  result.weatherRange = range;
  if (!range) return;

  await deps.waitForWeatherQuota(daysInclusive(range.startDate, range.endDate));
  const days = await deps.fetchDailyWeather({ latitude: hub.latitude, longitude: hub.longitude, timezone: hub.timezone, ...range }, { deadlineAt });
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
 * Records the hubs that were skipped because the time budget ran out.
 * @param skipped - the skipped hubs.
 * @param runId - the run's correlation id.
 * @param budgetMs - the budget that ran out.
 * @param deps - injected I/O.
 */
async function reportSkipped(skipped: Hub[], runId: string, budgetMs: number, deps: IngestDeps): Promise<void> {
  const message = `Time budget of ${Math.round(budgetMs / 1_000)} s used up; ${skipped.length} hub(s) not ingested this run (scored on stored data): ${skipped.map((h) => h.id).join(", ")}`;
  deps.log(formatBoundaryMessage({ name: "IngestTimeBudgetExceeded", message, functionName: "runIngest", boundary: "apiRoute" }));
  await deps.recordEvent({
    eventType: "ingest.hubs_skipped",
    source: "ingest",
    level: "warn",
    correlationId: runId,
    message,
    payload: { reason: "time_budget", budgetMs, hubIds: skipped.map((h) => h.id) },
  });
}

/**
 * Runs one ingest pass.
 * @param options - which hubs, who triggered it, and an optional time budget.
 * @param deps - injected I/O.
 * @returns the run summary (also stored as the `ingest.finished` event).
 * @throws only if the hub list itself can't be read; per-hub failures are recorded and skipped.
 */
export async function runIngest(options: IngestOptions, deps: IngestDeps): Promise<IngestSummary> {
  const runId = randomUUID();
  const startedAt = deps.now().getTime();
  const deadlineAt = options.timeBudgetMs === undefined ? undefined : startedAt + options.timeBudgetMs;
  await deps.recordEvent({
    eventType: "ingest.started",
    source: "ingest",
    correlationId: runId,
    payload: {
      trigger: options.trigger,
      hubIds: options.hubIds ?? "all",
      refreshFema: options.refreshFema ?? false,
      timeBudgetMs: options.timeBudgetMs ?? null,
    },
  });

  const allHubs = await deps.listActiveHubs();
  const hubs = options.hubIds ? allHubs.filter((hub) => options.hubIds!.includes(hub.id)) : allHubs;
  const unknown = (options.hubIds ?? []).filter((id) => !allHubs.some((hub) => hub.id === id));
  if (unknown.length > 0) deps.log(`⚠️  Unknown or inactive hub ids skipped: ${unknown.join(", ")}`);

  const withFema = options.refreshFema ? new Set<string>() : await deps.listHubIdsWithFema();
  const results: HubIngestResult[] = [];
  const skipped: Hub[] = [];

  for (const [index, hub] of hubs.entries()) {
    const result: HubIngestResult = { hubId: hub.id, femaFetched: false, weatherRange: null, weatherRowsSaved: 0 };
    results.push(result);
    if (deadlineAt !== undefined && deps.now().getTime() >= deadlineAt) {
      result.skipped = true;
      skipped.push(hub);
      continue;
    }
    if (!withFema.has(hub.id)) await ingestFema(hub, runId, deps, result, deadlineAt);
    try {
      await ingestWeather(hub, runId, deps, result, deadlineAt);
      const range = result.weatherRange ? `${result.weatherRange.startDate}..${result.weatherRange.endDate}` : "up to date";
      deps.log(
        `[${index + 1}/${hubs.length}] ${result.femaError ? "⚠️ " : "✅"} ${hub.name}: ${result.weatherRowsSaved} days (${range})${result.femaFetched ? " + FEMA" : ""}`,
      );
    } catch (error) {
      result.error = describeUnknownError(error);
      deps.log(`[${index + 1}/${hubs.length}] ❌ ${hub.name}: ${boundaryLogLine(error, "runIngest", "database")}`);
      await deps.recordEvent({
        eventType: "ingest.hub_failed",
        source: "ingest",
        level: "error",
        correlationId: runId,
        hubId: hub.id,
        message: result.error,
      });
    }
  }
  if (skipped.length > 0) await reportSkipped(skipped, runId, options.timeBudgetMs ?? 0, deps);

  const failed = results.filter((r) => r.error || r.femaError);
  const summary: IngestSummary = {
    runId,
    hubsProcessed: results.length - skipped.length,
    hubsFailed: failed.length,
    hubsSkipped: skipped.length,
    weatherRowsSaved: results.reduce((sum, r) => sum + r.weatherRowsSaved, 0),
    femaRecordsSaved: results.filter((r) => r.femaFetched).length,
    results,
  };
  await deps.recordEvent({
    eventType: "ingest.finished",
    source: "ingest",
    level: summary.hubsFailed > 0 || summary.hubsSkipped > 0 ? "warn" : "info",
    correlationId: runId,
    message: `${summary.hubsProcessed} hubs, ${summary.hubsFailed} failed, ${summary.hubsSkipped} skipped, ${summary.weatherRowsSaved} weather rows, ${summary.femaRecordsSaved} FEMA records`,
    payload: {
      durationMs: deps.now().getTime() - startedAt,
      hubsProcessed: summary.hubsProcessed,
      hubsFailed: summary.hubsFailed,
      hubsSkipped: summary.hubsSkipped,
      weatherRowsSaved: summary.weatherRowsSaved,
      femaRecordsSaved: summary.femaRecordsSaved,
      failedHubIds: failed.map((r) => r.hubId),
      skippedHubIds: skipped.map((h) => h.id),
    },
  });
  return summary;
}
