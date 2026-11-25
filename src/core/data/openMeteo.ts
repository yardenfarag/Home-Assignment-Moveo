/**
 * @module core/data/openMeteo
 *
 * Client for the Open-Meteo Historical Weather API (archive).
 * Docs: https://open-meteo.com/en/docs/historical-weather-api
 *
 * Data is modeled reanalysis (not station measurements) on a ~9–11 km grid.
 * Free tier is non-commercial; attribution (CC BY 4.0) is required.
 */
import { z } from "zod";
import { OPEN_METEO_DAILY_VARIABLES } from "../config/ingestConfig";
import type { DailyWeather } from "../domain/weather";
import { BoundaryError } from "../errors/boundaryError";
import { daysInclusive } from "../utils/dates";
import { fetchJsonWithRetry, type FetchLike, type SleepFn } from "./http";

const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";

/** What to fetch: one point, one date range. */
export interface ArchiveRequest {
  latitude: number;
  longitude: number;
  /** IANA timezone, so "a day" is the hub's local calendar day. */
  timezone: string;
  startDate: string;
  endDate: string;
}

/** Expected units — if Open-Meteo ever changes them we fail loudly instead of storing wrong numbers. */
const EXPECTED_UNITS = {
  snowfall_sum: "cm",
  temperature_2m_min: "°C",
  precipitation_sum: "mm",
  wind_gusts_10m_max: "km/h",
  apparent_temperature_max: "°C",
} as const;

const nullableNumbers = z.array(z.number().nullable());

/** Shape of the archive response we rely on. */
const archiveResponseSchema = z.object({
  daily_units: z.object(
    Object.fromEntries(OPEN_METEO_DAILY_VARIABLES.map((name) => [name, z.literal(EXPECTED_UNITS[name])])) as {
      [K in keyof typeof EXPECTED_UNITS]: z.ZodLiteral<(typeof EXPECTED_UNITS)[K]>;
    },
  ),
  daily: z.object({
    time: z.array(z.string()),
    snowfall_sum: nullableNumbers,
    temperature_2m_min: nullableNumbers,
    precipitation_sum: nullableNumbers,
    wind_gusts_10m_max: nullableNumbers,
    apparent_temperature_max: nullableNumbers,
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
  for (const name of OPEN_METEO_DAILY_VARIABLES) {
    if (daily[name].length !== length) throw new Error(`Open-Meteo array '${name}' has ${daily[name].length} values, expected ${length}`);
  }

  const days: DailyWeather[] = daily.time.map((date, i) => ({
    date,
    snowfallCm: daily.snowfall_sum[i],
    tempMinC: daily.temperature_2m_min[i],
    precipitationMm: daily.precipitation_sum[i],
    windGustMaxKmh: daily.wind_gusts_10m_max[i],
    apparentTempMaxC: daily.apparent_temperature_max[i],
  }));

  let end = days.length;
  while (end > 0 && isEmptyDay(days[end - 1])) end--;
  return days.slice(0, end);
}

/** True when a day has no values at all. */
function isEmptyDay(day: DailyWeather): boolean {
  return (
    day.snowfallCm === null &&
    day.tempMinC === null &&
    day.precipitationMm === null &&
    day.windGustMaxKmh === null &&
    day.apparentTempMaxC === null
  );
}

/**
 * Fetches daily weather for one point and date range.
 * @param request - point, timezone and date range.
 * @param deps - injectable fetch/sleep for tests.
 * @returns validated days, oldest first.
 * @throws BoundaryError (openMeteo) on HTTP failure or an unexpected response.
 */
export async function fetchDailyWeather(
  request: ArchiveRequest,
  deps: { fetchImpl?: FetchLike; sleepImpl?: SleepFn } = {},
): Promise<DailyWeather[]> {
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
