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
