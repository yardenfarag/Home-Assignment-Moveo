/**
 * @module core/config/ingestConfig
 *
 * Fixed settings for the data ingest. Changing these changes what data we
 * store, so each one is documented in docs/decisions.md.
 */
import type { Database } from "../db/database.types";
import type { DailyWeather } from "../domain/weather";

/** A `weather_daily` row as the database returns it. */
type WeatherDailyRow = Database["public"]["Tables"]["weather_daily"]["Row"];

/** First day of weather history we keep (D14). */
export const WEATHER_HISTORY_START = "2021-01-01";

/**
 * How many of the most recent days are re-fetched on every run, because the
 * archive revises its newest (preliminary) values (D14).
 */
export const REFETCH_RECENT_DAYS = 7;

/**
 * THE list of daily weather variables (single source of truth): the Open-Meteo name and the unit
 * we require, our `DailyWeather` field, and the `weather_daily` column. The request, the response
 * schema, the parsing, the "empty day" check and the database reads/writes are all derived from it.
 * `satisfies` makes the compiler reject a field or column name that doesn't exist.
 */
export const WEATHER_VARIABLES = [
  { openMeteo: "snowfall_sum", unit: "cm", field: "snowfallCm", column: "snowfall_cm" },
  { openMeteo: "temperature_2m_min", unit: "°C", field: "tempMinC", column: "temp_min_c" },
  { openMeteo: "precipitation_sum", unit: "mm", field: "precipitationMm", column: "precipitation_mm" },
  { openMeteo: "wind_gusts_10m_max", unit: "km/h", field: "windGustMaxKmh", column: "wind_gust_max_kmh" },
  { openMeteo: "apparent_temperature_max", unit: "°C", field: "apparentTempMaxC", column: "apparent_temp_max_c" },
] as const satisfies readonly {
  openMeteo: string;
  unit: string;
  field: Exclude<keyof DailyWeather, "date">;
  column: Exclude<keyof WeatherDailyRow, "hub_id" | "date" | "source" | "created_at" | "updated_at">;
}[];

/** One weather variable from {@link WEATHER_VARIABLES}. */
export type WeatherVariable = (typeof WEATHER_VARIABLES)[number];

/** Open-Meteo daily variables we request, in the order of our columns (derived). */
export const OPEN_METEO_DAILY_VARIABLES = WEATHER_VARIABLES.map((v) => v.openMeteo);

/**
 * A hub whose newest weather day is more than this many days older than the newest hub's is
 * called stale: the widgets list it and the agent's caveat names it (its scores are older).
 */
export const STALE_DATA_DAYS = 2;

/**
 * Open-Meteo free-tier limits (per IP), multiplied by a safety factor so we stay
 * comfortably below them. Source: https://open-meteo.com/en/terms
 */
export const OPEN_METEO_LIMITS = {
  perMinute: Math.floor(600 * 0.9),
  perHour: Math.floor(5_000 * 0.9),
  perDay: Math.floor(10_000 * 0.9),
} as const;

/** How many rows go into one database upsert. */
export const DB_UPSERT_CHUNK_SIZE = 1_000;
