/**
 * @module core/data/femaNri
 *
 * Client for the FEMA National Risk Index (NRI) county layer, served by FEMA's
 * public ArcGIS feature service (no key needed). We look up the county that
 * contains a hub's point and keep each hazard's annualized frequency (AFREQ =
 * expected events per year).
 *
 * Data page: https://hazards.fema.gov/nri/data-resources
 */
import { z } from "zod";
import { BoundaryError, describeUnknownError, formatBoundaryMessage } from "../errors/boundaryError";
import { fetchJsonWithRetry, type HttpDeps } from "./http";

/** FEMA's public ArcGIS query endpoint for the NRI county layer. */
const COUNTY_LAYER_URL =
  "https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Counties/FeatureServer/0/query";

/**
 * THE list of FEMA hazard fields we use (single source of truth), mapped to the
 * {@link FemaCountyRecord} key. The `fema_nri` column is the field in lower case
 * (see {@link femaHazardColumn}); the scoring name lives in femaRepository's typed map.
 */
export const FEMA_HAZARD_FIELDS = {
  HRCN_AFREQ: "hrcnAfreq", // hurricane
  TRND_AFREQ: "trndAfreq", // tornado
  HAIL_AFREQ: "hailAfreq", // hail
  IFLD_AFREQ: "ifldAfreq", // inland flooding (formerly RFLD)
  CFLD_AFREQ: "cfldAfreq", // coastal flooding
  ISTM_AFREQ: "istmAfreq", // ice storm
  WNTW_AFREQ: "wntwAfreq", // winter weather
  CWAV_AFREQ: "cwavAfreq", // cold wave
  HWAV_AFREQ: "hwavAfreq", // heat wave
  SWND_AFREQ: "swndAfreq", // strong wind
} as const;

/** A FEMA hazard field name, e.g. `HRCN_AFREQ`. */
export type FemaFieldName = keyof typeof FEMA_HAZARD_FIELDS;

/** The matching key on {@link FemaCountyRecord}, e.g. `hrcnAfreq`. */
export type FemaHazardKey = (typeof FEMA_HAZARD_FIELDS)[FemaFieldName];

/**
 * The `fema_nri` column for a FEMA field (`HRCN_AFREQ` → `hrcn_afreq`).
 * @param field - the FEMA field name.
 * @returns the column name.
 */
export function femaHazardColumn<F extends FemaFieldName>(field: F): Lowercase<F> {
  return field.toLowerCase() as Lowercase<F>;
}

/** FEMA NRI record for the county containing a hub. `null` frequency = hazard not applicable there. */
export type FemaCountyRecord = {
  countyFips: string;
  countyName: string;
  stateCode: string;
  nriVersion: string;
  /** County area in square miles (FEMA `AREA`). Used to score tornado per area (D53). */
  countyAreaSqMi: number;
  /** Every attribute FEMA returned, kept for traceability. */
  rawAttributes: Record<string, unknown>;
} & Record<FemaHazardKey, number | null>;

/** Non-hazard fields we request: county FIPS, county name, state, NRI version, county area. */
const ID_FIELDS = ["STCOFIPS", "COUNTY", "STATEABBRV", "NRI_VER", "AREA"] as const;

/** The attributes of one county feature (extra fields are kept, not rejected). */
const attributesSchema = z
  .object({
    STCOFIPS: z.string().regex(/^\d{5}$/),
    COUNTY: z.string().min(1),
    STATEABBRV: z.string().length(2),
    NRI_VER: z.string().min(1),
    AREA: z.number().positive(),
    ...Object.fromEntries(
      Object.keys(FEMA_HAZARD_FIELDS).map((field) => [field, z.number().min(0).nullable()]),
    ),
  })
  .loose();

/** The ArcGIS query response: a list of matching county features. */
const queryResponseSchema = z.object({
  features: z.array(z.object({ attributes: z.record(z.string(), z.unknown()) })),
});

/**
 * Builds the "which county contains this point?" query URL.
 * @param latitude - point latitude.
 * @param longitude - point longitude.
 * @returns the query URL.
 */
export function buildCountyQueryUrl(latitude: number, longitude: number): string {
  const params = new URLSearchParams({
    geometry: `${longitude},${latitude}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: [...ID_FIELDS, ...Object.keys(FEMA_HAZARD_FIELDS)].join(","),
    returnGeometry: "false",
    f: "json",
  });
  return `${COUNTY_LAYER_URL}?${params.toString()}`;
}

/**
 * Validates the ArcGIS response and extracts the county record. A point lies in one
 * county, so more than one match is unexpected: the first is used and the caller logs it.
 * @param json - the raw response body.
 * @returns the county record.
 * @throws Error when no county contains the point (e.g. outside the US).
 * @throws ZodError when fields are missing or malformed.
 */
export function parseCountyResponse(json: unknown): FemaCountyRecord {
  const { features } = queryResponseSchema.parse(json);
  if (features.length === 0) throw new Error("No FEMA county contains this point");
  const raw = features[0].attributes;
  const attributes = attributesSchema.parse(raw) as Record<string, unknown>;

  const hazards = Object.fromEntries(
    (Object.entries(FEMA_HAZARD_FIELDS) as [FemaFieldName, FemaHazardKey][]).map(([field, key]) => [
      key,
      attributes[field] as number | null,
    ]),
  ) as Record<FemaHazardKey, number | null>;

  return {
    countyFips: attributes.STCOFIPS as string,
    countyName: attributes.COUNTY as string,
    stateCode: attributes.STATEABBRV as string,
    nriVersion: attributes.NRI_VER as string,
    countyAreaSqMi: attributes.AREA as number,
    rawAttributes: raw,
    ...hazards,
  };
}

/**
 * Fetches the FEMA NRI record for the county containing a point.
 * @param latitude - point latitude.
 * @param longitude - point longitude.
 * @param deps - injectable fetch/sleep/log and an optional deadline.
 * @returns the county record.
 * @throws BoundaryError (fema) on HTTP failure, no county, or an unexpected response.
 */
export async function fetchFemaCountyByPoint(latitude: number, longitude: number, deps: HttpDeps = {}): Promise<FemaCountyRecord> {
  const json = await fetchJsonWithRetry({
    url: buildCountyQueryUrl(latitude, longitude),
    boundary: "fema",
    functionName: "fetchFemaCountyByPoint",
    errorName: "FemaFetchError",
    ...deps,
  });
  try {
    const record = parseCountyResponse(json);
    const matches = (json as { features: unknown[] }).features.length;
    if (matches > 1) {
      (deps.log ?? console.warn)(
        formatBoundaryMessage({
          name: "FemaMultipleCountiesWarning",
          message: `${matches} counties contain point ${latitude},${longitude}; using the first (${record.countyName}, ${record.stateCode}, ${record.countyFips})`,
          functionName: "fetchFemaCountyByPoint",
          boundary: "fema",
        }),
      );
    }
    return record;
  } catch (cause) {
    throw new BoundaryError({
      name: "FemaResponseError",
      message: `Unexpected FEMA NRI response for point ${latitude},${longitude}: ${describeUnknownError(cause)}`,
      functionName: "fetchFemaCountyByPoint",
      boundary: "fema",
      cause,
    });
  }
}
