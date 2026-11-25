/**
 * @module scripts/compute-fema-anchors
 *
 * Recomputes the FEMA "100" anchors (D47): the 95th percentile of each signal
 * across all US counties where FEMA rates the hazard. Tornado is per area (D53).
 *
 * `npm run fema:anchors` prints the values; they are then frozen by hand in
 * src/core/scoring/config.ts (FEMA_ANCHORS_P95) so scores never shift silently
 * when FEMA updates its data. Re-run when a new NRI version is released.
 */
import { fetchJsonWithRetry } from "../src/core/data/http";
import { percentile, round } from "../src/core/utils/stats";

const LAYER =
  "https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Counties/FeatureServer/0/query";
const AFREQ_FIELDS = ["HRCN", "TRND", "HAIL", "IFLD", "CFLD", "ISTM", "WNTW", "CWAV", "HWAV", "SWND"] as const;

type CountyRow = Record<string, number | string | null>;

/**
 * Downloads every county row (paged, 2,000 per page).
 * @returns all county attribute rows.
 */
async function fetchAllCounties(): Promise<CountyRow[]> {
  const rows: CountyRow[] = [];
  for (let offset = 0; ; offset += 2_000) {
    const params = new URLSearchParams({
      where: "1=1",
      outFields: ["STCOFIPS", "NRI_VER", "AREA", ...AFREQ_FIELDS.map((f) => `${f}_AFREQ`)].join(","),
      returnGeometry: "false",
      f: "json",
      resultOffset: String(offset),
      resultRecordCount: "2000",
    });
    const page = (await fetchJsonWithRetry({
      url: `${LAYER}?${params.toString()}`,
      boundary: "fema",
      functionName: "fetchAllCounties",
      errorName: "FemaFetchError",
    })) as { features: { attributes: CountyRow }[]; exceededTransferLimit?: boolean };
    rows.push(...page.features.map((feature) => feature.attributes));
    if (!page.exceededTransferLimit) return rows;
  }
}

/** Prints the p95 anchors. */
async function main(): Promise<void> {
  const rows = await fetchAllCounties();
  console.log(`Counties: ${rows.length} · NRI version: ${rows[0]?.NRI_VER}`);
  for (const field of AFREQ_FIELDS) {
    const values =
      field === "TRND"
        ? rows
            .filter((r) => r.TRND_AFREQ !== null && Number(r.AREA) > 0)
            .map((r) => (Number(r.TRND_AFREQ) / Number(r.AREA)) * 1_000)
        : rows.filter((r) => r[`${field}_AFREQ`] !== null).map((r) => Number(r[`${field}_AFREQ`]));
    const label = field === "TRND" ? "TRND per 1,000 sq mi" : `${field}_AFREQ`;
    console.log(`${label.padEnd(22)} p95 = ${round(percentile(values, 0.95), 3)}  (n=${values.length})`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
