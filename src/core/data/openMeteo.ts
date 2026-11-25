/**
 * @module core/data/openMeteo
 *
 * Client for the Open-Meteo Historical Weather API (archive).
 * Docs: https://open-meteo.com/en/docs/historical-weather-api
 *
 * Data is modeled reanalysis (not station measurements) on a ~9–11 km grid.
 * Free tier is non-commercial; attribution (CC BY 4.0) is required.
 * The variables, units and field names all come from `WEATHER_VARIABLES` (ingestConfig).
 */
import { z } from "zod";
import { OPEN_METEO_DAILY_VARIABLES, WEATHER_VARIABLES } from "../config/ingestConfig";
import type { DailyWeather } from "../domain/weather";
import { BoundaryError } from "../errors/boundaryError";
import { daysInclusive } from "../utils/dates";
import { fetchJsonWithRetry, type HttpDeps } from "./http";

/** The archive endpoint (no API key on the free tier). */
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";

/** What to fetch: one point, one date range. */
export interface ArchiveRequest {
  /** Point latitude (WGS84). */
  latitude: number;
  /** Point longitude (WGS84). */
  longitude: number;
  /** IANA timezone, so "a day" is the hub's local calendar day. */
  timezone: string;
  /** First day `YYYY-MM-DD` (inclusive). */
  startDate: string;
  /** Last day `YYYY-MM-DD` (inclusive). */
  endDate: string;
}

/** One daily array: a value per day, null when the archive has none. */
const nullableNumbers = z.array(z.number().nullable());

/** Open-Meteo variable name. */
type OpenMeteoVariable = (typeof WEATHER_VARIABLES)[number]["openMeteo"];

/**
 * Shape of the archive response we rely on. The units must be exactly ours — if Open-Meteo
 * ever changes them we fail loudly instead of storing wrong numbers.
 */
const archiveResponseSchema = z.object({
  daily_units: z.object(Object.fromEntries(WEATHER_VARIABLES.map((v) => [v.openMeteo, z.literal(v.unit)])) as Record<OpenMeteoVariable, z.ZodLiteral<string>>),
  daily: z.object({
    time: z.array(z.string()),
    ...(Object.fromEntries(WEATHER_VARIABLES.map((v) => [v.openMeteo, nullableNumbers])) as Record<OpenMeteoVariable, typeof nullableNumbers>),
  }),
});

/**
 * Builds the archive request URL.
 * @param request - point, timezone and date range.
 * @returns the full URL.
 */
export function buildArchiveUrl(request: ArchiveRequest): string {
  const params = new URLSearchParams({
    latitude: String(request.latitude),
    longitude: String(request.longitude),
    start_date: request.startDate,
    end_date: request.endDate,
    daily: OPEN_METEO_DAILY_VARIABLES.join(","),
    timezone: request.timezone,
  });
  return `${ARCHIVE_URL}?${params.toString()}`;
}

/**
 * Estimates how many "calls" Open-Meteo counts for a request: requests over
 * 10 variables or 14 days count as fractional multiples.
 * @param days - number of days requested.
 * @param variableCount - number of variables requested.
 * @returns the weighted call count (at least 1).
 */
export function estimateCallWeight(days: number, variableCount: number = OPEN_METEO_DAILY_VARIABLES.length): number {
  return Math.max(1, variableCount / 10) * Math.max(1, days / 14);
}

/**
 * Validates an archive response and turns it into one object per day.
 * Trailing days where every value is null (not published yet) are dropped.
 * @param json - the raw response body.
 * @returns the days, oldest first.
 * @throws ZodError when the shape or units are unexpected.
 * @throws Error when the arrays have different lengths.
 */
export function parseArchiveResponse(json: unknown): DailyWeather[] {
  const { daily } = archiveResponseSchema.parse(json);
  const length = daily.time.length;
  for (const { openMeteo } of WEATHER_VARIABLES) {
    if (daily[openMeteo].length !== length) throw new Error(`Open-Meteo array '${openMeteo}' has ${daily[openMeteo].length} values, expected ${length}`);
  }

  const days: DailyWeather[] = daily.time.map(
    (date, i) => ({ date, ...Object.fromEntries(WEATHER_VARIABLES.map((v) => [v.field, daily[v.openMeteo][i]])) }) as DailyWeather,
  );

  let end = days.length;
  while (end > 0 && isEmptyDay(days[end - 1])) end--;
  return days.slice(0, end);
}

/**
 * True when a day has no values at all (derived from the variable list, so a new variable can't be forgotten).
 * @param day - one parsed day.
 * @returns true when every weather value is null.
 */
function isEmptyDay(day: DailyWeather): boolean {
  return WEATHER_VARIABLES.every((v) => day[v.field] === null);
}

/**
 * Fetches daily weather for one point and date range.
 * @param request - point, timezone and date range.
 * @param deps - injectable fetch/sleep/log and an optional deadline.
 * @returns validated days, oldest first.
 * @throws BoundaryError (openMeteo) on HTTP failure or an unexpected response.
 */
export async function fetchDailyWeather(request: ArchiveRequest, deps: HttpDeps = {}): Promise<DailyWeather[]> {
  if (daysInclusive(request.startDate, request.endDate) === 0) return [];
  const json = await fetchJsonWithRetry({
    url: buildArchiveUrl(request),
    boundary: "openMeteo",
    functionName: "fetchDailyWeather",
    errorName: "OpenMeteoFetchError",
    ...deps,
  });
  try {
    return parseArchiveResponse(json);
  } catch (cause) {
    throw new BoundaryError({
      name: "OpenMeteoResponseError",
      message: `Unexpected archive response for ${request.startDate}..${request.endDate}`,
      functionName: "fetchDailyWeather",
      boundary: "openMeteo",
      cause,
    });
  }
}
