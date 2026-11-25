/**
 * @module core/db/hubsRepository
 *
 * Reads hubs from the database and converts rows (snake_case) into validated
 * {@link Hub} objects (camelCase).
 */
import { BoundaryError } from "../errors/boundaryError";
import { hubSchema, type Hub } from "../domain/hub";
import type { Database } from "./database.types";
import { getDb, type Db } from "./client";

/** A stored `hubs` row (snake_case, as the database returns it). */
type HubRow =Database["public"]["Tables"]["hubs"]["Row"];

/**
 * Converts a database row into a validated Hub.
 * @param row - a row from the `hubs` table.
 * @returns the validated hub.
 * @throws ZodError when the row breaks the hub rules.
 */
export function hubFromRow(row: HubRow): Hub {
  return hubSchema.parse({
    id: row.id,
    name: row.name,
    state: row.state,
    region: row.region,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    timezone: row.timezone,
    countyFips: row.county_fips,
    countyName: row.county_name,
    isActive: row.is_active,
  });
}

/**
 * Lists all active hubs, ordered by id.
 * @param db - database client (injectable for tests).
 * @returns the active hubs.
 * @throws BoundaryError (database) when the query fails or a row is invalid.
 */
export async function listActiveHubs(db: Db = getDb()): Promise<Hub[]> {
  const { data, error } = await db.from("hubs").select("*").eq("is_active", true).order("id");
  if (error) {
    throw new BoundaryError({
      name: "SupabaseQueryError",
      message: `Could not read hubs: ${error.message}`,
      functionName: "listActiveHubs",
      boundary: "database",
      cause: error,
    });
  }
  try {
    return data.map(hubFromRow);
  } catch (cause) {
    throw new BoundaryError({
      name: "HubRowValidationError",
      message: "A row in the hubs table has invalid data",
      functionName: "listActiveHubs",
      boundary: "database",
      cause,
    });
  }
}
