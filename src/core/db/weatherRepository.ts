/**
 * @module core/db/weatherRepository
 *
 * Reads and writes the `weather_daily` table.
 */
import { DB_UPSERT_CHUNK_SIZE } from "../config/ingestConfig";
import type { DailyWeather } from "../domain/weather";
import { BoundaryError } from "../errors/boundaryError";
import { getDb, type Db } from "./client";

/**
 * Returns the newest stored date for a hub.
 * @param hubId - hub slug.
 * @param db - database client (injectable).
 * @returns `YYYY-MM-DD`, or null when nothing is stored.
 * @throws BoundaryError (database) when the query fails.
 */
export async function getLatestWeatherDate(hubId: string, db: Db = getDb()): Promise<string | null> {
  const { data, error } = await db
    .from("weather_daily")
    .select("date")
    .eq("hub_id", hubId)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new BoundaryError({
      name: "SupabaseQueryError",
      message: `Could not read latest weather date for ${hubId}: ${error.message}`,
      functionName: "getLatestWeatherDate",
      boundary: "database",
      cause: error,
    });
  }
  return data?.date ?? null;
}

/**
 * Inserts or updates daily weather rows for a hub (keyed by hub + date), in chunks.
 * @param hubId - hub slug.
 * @param days - days to store.
 * @param db - database client (injectable).
 * @returns number of rows written.
 * @throws BoundaryError (database) when an upsert fails.
 */
export async function upsertWeatherDays(hubId: string, days: DailyWeather[], db: Db = getDb()): Promise<number> {
  for (let i = 0; i < days.length; i += DB_UPSERT_CHUNK_SIZE) {
    const rows = days.slice(i, i + DB_UPSERT_CHUNK_SIZE).map((day) => ({
      hub_id: hubId,
      date: day.date,
      snowfall_cm: day.snowfallCm,
      temp_min_c: day.tempMinC,
      precipitation_mm: day.precipitationMm,
      wind_gust_max_kmh: day.windGustMaxKmh,
      apparent_temp_max_c: day.apparentTempMaxC,
    }));
    const { error } = await db.from("weather_daily").upsert(rows, { onConflict: "hub_id,date" });
    if (error) {
      throw new BoundaryError({
        name: "SupabaseUpsertError",
        message: `Could not store weather rows ${i}-${i + rows.length} for ${hubId}: ${error.message}`,
        functionName: "upsertWeatherDays",
        boundary: "database",
        cause: error,
      });
    }
  }
  return days.length;
}

/** PostgREST returns at most this many rows per request (Supabase default `max_rows`). */
const PAGE_SIZE = 1_000;

/**
 * Reads a hub's daily weather for a date range, oldest first. Pages through the
 * results, because Supabase caps each response at 1,000 rows and a scoring
 * window is ~1,826 days.
 * @param hubId - hub slug.
 * @param startDate - first day (inclusive).
 * @param endDate - last day (inclusive).
 * @param db - database client (injectable).
 * @returns the days in the range.
 * @throws BoundaryError (database) when a query fails.
 */
export async function getWeatherDays(
  hubId: string,
  startDate: string,
  endDate: string,
  db: Db = getDb(),
): Promise<DailyWeather[]> {
  const days: DailyWeather[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from("weather_daily")
      .select("date, snowfall_cm, temp_min_c, precipitation_mm, wind_gust_max_kmh, apparent_temp_max_c")
      .eq("hub_id", hubId)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      throw new BoundaryError({
        name: "SupabaseQueryError",
        message: `Could not read weather for ${hubId} (${startDate}..${endDate}): ${error.message}`,
        functionName: "getWeatherDays",
        boundary: "database",
        cause: error,
      });
    }
    days.push(
      ...data.map((row) => ({
        date: row.date,
        snowfallCm: row.snowfall_cm === null ? null : Number(row.snowfall_cm),
        tempMinC: row.temp_min_c === null ? null : Number(row.temp_min_c),
        precipitationMm: row.precipitation_mm === null ? null : Number(row.precipitation_mm),
        windGustMaxKmh: row.wind_gust_max_kmh === null ? null : Number(row.wind_gust_max_kmh),
        apparentTempMaxC: row.apparent_temp_max_c === null ? null : Number(row.apparent_temp_max_c),
      })),
    );
    if (data.length < PAGE_SIZE) return days;
  }
}

/**
 * Returns the first and last day of weather data across all hubs.
 * @param db - database client (injectable).
 * @returns earliest and latest dates, or null when the table is empty.
 * @throws BoundaryError (database) when a query fails.
 */
export async function getWeatherBounds(db: Db = getDb()): Promise<{ earliest: string; latest: string } | null> {
  const pick = async (ascending: boolean) => {
    const { data, error } = await db.from("weather_daily").select("date").order("date", { ascending }).limit(1).maybeSingle();
    if (error) {
      throw new BoundaryError({
        name: "SupabaseQueryError",
        message: `Could not read weather date bounds: ${error.message}`,
        functionName: "getWeatherBounds",
        boundary: "database",
        cause: error,
      });
    }
    return data?.date ?? null;
  };
  const [earliest, latest] = await Promise.all([pick(true), pick(false)]);
  return earliest && latest ? { earliest, latest } : null;
}
