/**
 * @module core/domain/hub
 *
 * The Hub: one of our distribution hubs (a US metro). Defined with Zod so data
 * coming out of the database is validated before the rest of the code trusts it.
 */
import { z } from "zod";

/** Official US Census Bureau regions — gives "Midwest" a quotable definition. */
export const CENSUS_REGIONS = ["Northeast", "Midwest", "South", "West"] as const;

/** One of the four US Census regions. */
export type CensusRegion = (typeof CENSUS_REGIONS)[number];

/** Schema for a validated hub. */
export const hubSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  state: z.string().length(2),
  region: z.enum(CENSUS_REGIONS),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timezone: z.string().min(1),
  countyFips: z.string().nullable(),
  countyName: z.string().nullable(),
  isActive: z.boolean(),
});

/** A distribution hub. Location is the metro's city-center point. */
export type Hub = z.infer<typeof hubSchema>;
