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
import { BoundaryError } from "../errors/boundaryError";
import { fetchJsonWithRetry, type FetchLike, type SleepFn } from "./http";

const COUNTY_LAYER_URL =
  "https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Counties/FeatureServer/0/query";

/** FEMA hazard codes we use, mapped to our column names. */
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

type FemaFieldName = keyof typeof FEMA_HAZARD_FIELDS;
type FemaHazardKey = (typeof FEMA_HAZARD_FIELDS)[FemaFieldName];

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

const ID_FIELDS = ["STCOFIPS", "COUNTY", "STATEABBRV", "NRI_VER", "AREA"] as const;

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
 * Validates the ArcGIS response and extracts the county record.
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
 * @param deps - injectable fetch/sleep for tests.
 * @returns the county record.
 * @throws BoundaryError (fema) on HTTP failure, no county, or an unexpected response.
 */
export async function fetchFemaCountyByPoint(
  latitude: number,
  longitude: number,
  deps: { fetchImpl?: FetchLike; sleepImpl?: SleepFn } = {},
): Promise<FemaCountyRecord> {
  const json = await fetchJsonWithRetry({
    url: buildCountyQueryUrl(latitude, longitude),
    boundary: "fema",
    functionName: "fetchFemaCountyByPoint",
    errorName: "FemaFetchError",
    ...deps,
  });
  try {
    return parseCountyResponse(json);
  } catch (cause) {
    throw new BoundaryError({
      name: "FemaResponseError",
      message: `Unexpected FEMA NRI response for point ${latitude},${longitude}: ${cause instanceof Error ? cause.message : "invalid"}`,
      functionName: "fetchFemaCountyByPoint",
      boundary: "fema",
      cause,
    });
  }
}
