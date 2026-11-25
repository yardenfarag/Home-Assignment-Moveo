/**
 * @module core/config/ingestConfig
 *
 * Fixed settings for the data ingest. Changing these changes what data we
 * store, so each one is documented in docs/decisions.md.
 */

/** First day of weather history we keep (D14). */
export const WEATHER_HISTORY_START = "2021-01-01";

/**
 * How many of the most recent days are re-fetched on every run, because the
 * archive revises its newest (preliminary) values (D14).
 */
export const REFETCH_RECENT_DAYS = 7;

/** Open-Meteo daily variables we request, in the order of our columns. */
export const OPEN_METEO_DAILY_VARIABLES = [
  "snowfall_sum",
  "temperature_2m_min",
  "precipitation_sum",
  "wind_gusts_10m_max",
  "apparent_temperature_max",
] as const;

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
