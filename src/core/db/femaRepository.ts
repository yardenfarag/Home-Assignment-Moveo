/**
 * @module core/db/femaRepository
 *
 * Reads and writes the `fema_nri` table, and copies the county onto the hub row.
 */
import type { FemaCountyRecord } from "../data/femaNri";
import { BoundaryError } from "../errors/boundaryError";
import type { Json } from "./database.types";
import { getDb, type Db } from "./client";

/**
 * Lists hub ids that already have a FEMA record.
 * @param db - database client (injectable).
 * @returns set of hub ids.
 * @throws BoundaryError (database) when the query fails.
 */
export async function listHubIdsWithFema(db: Db = getDb()): Promise<Set<string>> {
  const { data, error } = await db.from("fema_nri").select("hub_id");
  if (error) {
    throw new BoundaryError({
      name: "SupabaseQueryError",
      message: `Could not read fema_nri: ${error.message}`,
      functionName: "listHubIdsWithFema",
      boundary: "database",
      cause: error,
    });
  }
  return new Set(data.map((row) => row.hub_id));
}

/**
 * Stores a hub's FEMA county record and fills in the hub's county columns.
 * @param hubId - hub slug.
 * @param record - FEMA county record.
 * @param db - database client (injectable).
 * @throws BoundaryError (database) when a write fails.
 */
export async function saveFemaRecord(hubId: string, record: FemaCountyRecord, db: Db = getDb()): Promise<void> {
  const { error: femaError } = await db.from("fema_nri").upsert(
    {
      hub_id: hubId,
      county_fips: record.countyFips,
      county_name: record.countyName,
      nri_version: record.nriVersion,
      hrcn_afreq: record.hrcnAfreq,
      trnd_afreq: record.trndAfreq,
      hail_afreq: record.hailAfreq,
      ifld_afreq: record.ifldAfreq,
      cfld_afreq: record.cfldAfreq,
      istm_afreq: record.istmAfreq,
      wntw_afreq: record.wntwAfreq,
      cwav_afreq: record.cwavAfreq,
      hwav_afreq: record.hwavAfreq,
      swnd_afreq: record.swndAfreq,
      raw_attributes: record.rawAttributes as Json,
    },
    { onConflict: "hub_id" },
  );
  if (femaError) {
    throw new BoundaryError({
      name: "SupabaseUpsertError",
      message: `Could not store FEMA record for ${hubId}: ${femaError.message}`,
      functionName: "saveFemaRecord",
      boundary: "database",
      cause: femaError,
    });
  }

  const { error: hubError } = await db
    .from("hubs")
    .update({ county_fips: record.countyFips, county_name: record.countyName })
    .eq("id", hubId);
  if (hubError) {
    throw new BoundaryError({
      name: "SupabaseUpdateError",
      message: `Could not set county on hub ${hubId}: ${hubError.message}`,
      functionName: "saveFemaRecord",
      boundary: "database",
      cause: hubError,
    });
  }
}
