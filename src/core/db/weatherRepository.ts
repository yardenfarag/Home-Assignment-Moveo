/**
 * @module core/db/weatherRepository
 *
 * Reads and writes the `weather_daily` table.
 */
import { DB_UPSERT_CHUNK_SIZE, WEATHER_VARIABLES, type WeatherVariable } from "../config/ingestConfig";
import type { DailyWeather } from "../domain/weather";
import { BoundaryError } from "../errors/boundaryError";
import { daysInclusive } from "../utils/dates";
import type { Database } from "./database.types";
import { getDb, type Db } from "./client";

/** A stored `weather_daily` row. */
type WeatherRow = Database["public"]["Tables"]["weather_daily"]["Row"];

/** A `weather_daily` row to insert or update. */
type WeatherInsert = Database["public"]["Tables"]["weather_daily"]["Insert"];

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
    const rows = days.slice(i, i + DB_UPSERT_CHUNK_SIZE).map(
      (day): WeatherInsert => ({ hub_id: hubId, date: day.date, ...Object.fromEntries(WEATHER_VARIABLES.map((v) => [v.column, day[v.field]])) }),
    );
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

/** Rows we ask for per request (Supabase's default `max_rows`; the server may return fewer). */
const PAGE_SIZE = 1_000;

/** The columns read back for scoring and stats (derived from WEATHER_VARIABLES). */
const WEATHER_SELECT = ["date", ...WEATHER_VARIABLES.map((v) => v.column)].join(", ");

/**
 * Converts one stored row into a {@link DailyWeather} (numeric columns can arrive as strings).
 * @param row - the date plus the weather columns.
 * @returns the day.
 */
function dayFromRow(row: Pick<WeatherRow, "date" | WeatherVariable["column"]>): DailyWeather {
  return {
    date: row.date,
    ...Object.fromEntries(WEATHER_VARIABLES.map((v) => [v.field, row[v.column] === null ? null : Number(row[v.column])])),
  } as DailyWeather;
}

/**
 * Reads a hub's daily weather for a date range, oldest first. Pages through the
 * results, because Supabase caps each response (1,000 rows by default) and a scoring
 * window is ~1,826 days. Each page starts where the rows received so far end, and it
 * stops only when every day of the range is read or a page comes back empty — so a
 * server cap lower than {@link PAGE_SIZE} can't silently cut the window short (lesson 8).
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
  const maxRows = daysInclusive(startDate, endDate); // one row per hub per day (primary key)
  while (days.length < maxRows) {
    const from = days.length;
    const { data, error } = await db
      .from("weather_daily")
      .select(WEATHER_SELECT)
      .eq("hub_id", hubId)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
      .overrideTypes<Pick<WeatherRow, "date" | WeatherVariable["column"]>[], { merge: false }>();
    if (error) {
      throw new BoundaryError({
        name: "SupabaseQueryError",
        message: `Could not read weather for ${hubId} (${startDate}..${endDate}): ${error.message}`,
        functionName: "getWeatherDays",
        boundary: "database",
        cause: error,
      });
    }
    if (data.length === 0) break;
    days.push(...data.map(dayFromRow));
  }
  return days;
}

/**
 * Returns the first and last day of weather data across all hubs.
 * @param db - database client (injectable).
 * @returns earliest and latest dates, or null when the table is empty.
 * @throws BoundaryError (database) when a query fails.
 */
export async function getWeatherBounds(db: Db = getDb()): Promise<{ earliest: string; latest: string } | null> {
  /**
   * Reads the first or last stored date.
   * @param ascending - true for the earliest date, false for the latest.
   * @returns the date, or null when the table is empty.
   */
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
