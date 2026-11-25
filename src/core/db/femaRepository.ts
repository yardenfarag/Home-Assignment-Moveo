/**
 * @module core/db/femaRepository
 *
 * Reads and writes the `fema_nri` table, and copies the county onto the hub row.
 *
 * Source of truth for a hub's county: `fema_nri` (`county_fips`, `county_name`). The
 * `hubs.county_fips` / `hubs.county_name` columns are a display copy, written FIRST by
 * {@link saveFemaRecord}, so a failed save never leaves a FEMA row behind that the next
 * ingest would treat as done (see {@link listHubIdsWithFema}).
 */
import { FEMA_HAZARD_FIELDS, femaHazardColumn, type FemaCountyRecord, type FemaFieldName } from "../data/femaNri";
import { BoundaryError } from "../errors/boundaryError";
import type { FemaSignals } from "../scoring/types";
import type { Database, Json } from "./database.types";
import { getDb, type Db } from "./client";

/** A stored `fema_nri` row. */
type FemaRow = Database["public"]["Tables"]["fema_nri"]["Row"];

/** A `fema_nri` row to insert or update. */
type FemaInsert = Database["public"]["Tables"]["fema_nri"]["Insert"];

/** The FEMA hazard names the scoring uses (every {@link FemaSignals} key except the area). */
type FemaSignalName = Exclude<keyof FemaSignals, "countyAreaSqMi">;

/**
 * Scoring name for each FEMA field. `Record<FemaFieldName, …>` makes the compiler demand an
 * entry for every field in FEMA_HAZARD_FIELDS; the test checks every signal is covered once.
 */
export const FEMA_SIGNAL_BY_FIELD: Record<FemaFieldName, FemaSignalName> = {
  HRCN_AFREQ: "hurricane",
  TRND_AFREQ: "tornado",
  HAIL_AFREQ: "hail",
  IFLD_AFREQ: "inlandFlood",
  CFLD_AFREQ: "coastalFlood",
  ISTM_AFREQ: "iceStorm",
  WNTW_AFREQ: "winterWeather",
  CWAV_AFREQ: "coldWave",
  HWAV_AFREQ: "heatWave",
  SWND_AFREQ: "strongWind",
};

/** The FEMA fields, typed (Object.keys loses the type). */
const FEMA_FIELDS = Object.keys(FEMA_HAZARD_FIELDS) as FemaFieldName[];

/**
 * Converts a nullable numeric column to number | null.
 * @param value - the column value (numeric columns can arrive as strings).
 * @returns the number, or null.
 */
const num = (value: number | string | null) => (value === null ? null : Number(value));

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
    ...(Object.fromEntries(FEMA_FIELDS.map((field) => [FEMA_SIGNAL_BY_FIELD[field], num(row[femaHazardColumn(field)])])) as Record<
      FemaSignalName,
      number | null
    >),
  };
}

/**
 * The `fema_nri` row for a FEMA county record.
 * @param hubId - hub slug.
 * @param record - FEMA county record.
 * @returns the row to upsert.
 */
export function femaRowFromRecord(hubId: string, record: FemaCountyRecord): FemaInsert {
  return {
    hub_id: hubId,
    county_fips: record.countyFips,
    county_name: record.countyName,
    nri_version: record.nriVersion,
    county_area_sq_mi: record.countyAreaSqMi,
    ...Object.fromEntries(FEMA_FIELDS.map((field) => [femaHazardColumn(field), record[FEMA_HAZARD_FIELDS[field]]])),
    raw_attributes: record.rawAttributes as Json,
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
 * Lists hub ids that already have a FEMA record. A row exists only after BOTH writes of
 * {@link saveFemaRecord} succeeded, so a hub listed here is really done.
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
 * The NRI versions of the stored FEMA records (normally exactly one), for the data-status widget.
 * @param db - database client (injectable).
 * @returns distinct versions, sorted.
 * @throws BoundaryError (database) when the query fails.
 */
export async function getStoredNriVersions(db: Db = getDb()): Promise<string[]> {
  const { data, error } = await db.from("fema_nri").select("nri_version");
  if (error) {
    throw new BoundaryError({
      name: "SupabaseQueryError",
      message: `Could not read fema_nri versions: ${error.message}`,
      functionName: "getStoredNriVersions",
      boundary: "database",
      cause: error,
    });
  }
  return [...new Set(data.map((row) => row.nri_version))].sort();
}

/**
 * Stores a hub's FEMA county record. The two writes are not one transaction, so the order
 * matters: the hub's display copy of the county is written first, the `fema_nri` row last.
 * If the first write fails, nothing is stored; if the second fails, the hub has no FEMA row
 * and the next ingest fetches it again and rewrites both. Either way they can't stay out of step.
 * @param hubId - hub slug.
 * @param record - FEMA county record.
 * @param db - database client (injectable).
 * @throws BoundaryError (database) when a write fails.
 */
export async function saveFemaRecord(hubId: string, record: FemaCountyRecord, db: Db = getDb()): Promise<void> {
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

  const { error: femaError } = await db.from("fema_nri").upsert(femaRowFromRecord(hubId, record), { onConflict: "hub_id" });
  if (femaError) {
    throw new BoundaryError({
      name: "SupabaseUpsertError",
      message: `Could not store FEMA record for ${hubId}: ${femaError.message}`,
      functionName: "saveFemaRecord",
      boundary: "database",
      cause: femaError,
    });
  }
}
