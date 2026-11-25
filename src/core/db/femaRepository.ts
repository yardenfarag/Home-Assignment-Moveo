/**
 * @module core/db/femaRepository
 *
 * Reads and writes the `fema_nri` table, and copies the county onto the hub row.
 */
import type { FemaCountyRecord } from "../data/femaNri";
import { BoundaryError } from "../errors/boundaryError";
import type { FemaSignals } from "../scoring/types";
import type { Database, Json } from "./database.types";
import { getDb, type Db } from "./client";

type FemaRow = Database["public"]["Tables"]["fema_nri"]["Row"];

/** Converts a nullable numeric column to number | null. */
const num = (value: number | null) => (value === null ? null : Number(value));

/**
 * Converts a `fema_nri` row into scoring inputs.
 * @param row - the database row.
 * @returns the FEMA signals.
 * @throws Error when the county area is missing (tornado can't be scored per area — run `npm run ingest -- --refresh-fema`).
 */
export function femaSignalsFromRow(row: FemaRow): FemaSignals {
  if (row.county_area_sq_mi === null) {
    throw new Error(`FEMA record for ${row.hub_id} has no county area; run: npm run ingest -- --refresh-fema`);
  }
  return {
    countyAreaSqMi: Number(row.county_area_sq_mi),
    hurricane: num(row.hrcn_afreq),
    tornado: num(row.trnd_afreq),
    hail: num(row.hail_afreq),
    inlandFlood: num(row.ifld_afreq),
    coastalFlood: num(row.cfld_afreq),
    iceStorm: num(row.istm_afreq),
    winterWeather: num(row.wntw_afreq),
    coldWave: num(row.cwav_afreq),
    heatWave: num(row.hwav_afreq),
    strongWind: num(row.swnd_afreq),
  };
}

/**
 * Reads every FEMA record as scoring inputs, keyed by hub id.
 * @param db - database client (injectable).
 * @returns map of hub id → FEMA signals (rows that can't be converted are left out and reported).
 * @throws BoundaryError (database) when the query fails.
 */
export async function getFemaSignalsByHub(
  db: Db = getDb(),
): Promise<{ signals: Map<string, FemaSignals>; problems: Map<string, string> }> {
  const { data, error } = await db.from("fema_nri").select("*");
  if (error) {
    throw new BoundaryError({
      name: "SupabaseQueryError",
      message: `Could not read fema_nri: ${error.message}`,
      functionName: "getFemaSignalsByHub",
      boundary: "database",
      cause: error,
    });
  }
  const signals = new Map<string, FemaSignals>();
  const problems = new Map<string, string>();
  for (const row of data) {
    try {
      signals.set(row.hub_id, femaSignalsFromRow(row));
    } catch (problem) {
      problems.set(row.hub_id, problem instanceof Error ? problem.message : String(problem));
    }
  }
  return { signals, problems };
}

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
      county_area_sq_mi: record.countyAreaSqMi,
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
