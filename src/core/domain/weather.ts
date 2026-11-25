/**
 * @module core/domain/weather
 *
 * One day of weather at one hub, as stored in `weather_daily`.
 * Values are `null` when the source has no data for that day.
 */
import { z } from "zod";

/** Schema for one day of weather (metric units). */
export const dailyWeatherSchema = z.object({
  /** Calendar day in the hub's local timezone, `YYYY-MM-DD`. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Snowfall sum, centimetres. */
  snowfallCm: z.number().nullable(),
  /** Minimum air temperature at 2 m, °C. */
  tempMinC: z.number().nullable(),
  /** Precipitation sum (rain + snow water equivalent), millimetres. */
  precipitationMm: z.number().nullable(),
  /** Maximum wind gust at 10 m, km/h. */
  windGustMaxKmh: z.number().nullable(),
  /** Maximum apparent ("feels like") temperature, °C. */
  apparentTempMaxC: z.number().nullable(),
});

/** One day of weather at one hub. */
export type DailyWeather = z.infer<typeof dailyWeatherSchema>;
