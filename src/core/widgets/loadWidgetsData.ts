/**
 * @module core/widgets/loadWidgetsData
 *
 * Loads what the widgets need from the database and builds their data.
 */
import { getStoredNriVersions } from "../db/femaRepository";
import { listActiveHubs } from "../db/hubsRepository";
import { getLatestSnapshots } from "../db/scoresRepository";
import { getWeatherBounds } from "../db/weatherRepository";
import { BoundaryError, formatBoundaryMessage } from "../errors/boundaryError";
import { FEMA_ANCHORS_NRI_VERSION } from "../scoring/config";
import { activeSnapshots, buildWidgetsData, type WidgetsData, type WidgetsInput } from "./widgetsData";

/** Where the widget data comes from (injectable for tests; defaults to the database). */
export interface WidgetsDeps {
  /** The active hubs. */
  listActiveHubs: () => Promise<WidgetsInput["hubs"]>;
  /** The latest snapshot per hub (null when nothing is scored yet). */
  getLatestSnapshots: () => Promise<WidgetsInput["snapshots"] | null>;
  /** The first and last stored weather day (null when none). */
  getWeatherBounds: () => Promise<WidgetsInput["weatherBounds"] | null>;
  /** The NRI versions of the stored FEMA records. */
  getStoredNriVersions: () => Promise<string[]>;
  /** Where warnings go (default: `console.warn`). */
  log: (line: string) => void;
}

/** The real database reads. */
const defaultDeps: WidgetsDeps = {
  listActiveHubs: () => listActiveHubs(),
  getLatestSnapshots: () => getLatestSnapshots(),
  getWeatherBounds: () => getWeatherBounds(),
  getStoredNriVersions: () => getStoredNriVersions(),
  log: (line) => console.warn(line),
};

/**
 * Reads hubs, latest snapshots, the weather date range and the stored FEMA version, then builds
 * the widget data. Logs a warning when the stored FEMA data's version differs from the one the
 * scoring anchors were computed from (the widget shows it too).
 * @param deps - data sources (default: the database).
 * @returns the widget data.
 * @throws BoundaryError (database) — `NoDataError` when no active hub has been scored yet.
 */
export async function loadWidgetsData(deps: WidgetsDeps = defaultDeps): Promise<WidgetsData> {
  const [hubs, snapshots, weatherBounds, femaVersions] = await Promise.all([
    deps.listActiveHubs(),
    deps.getLatestSnapshots(),
    deps.getWeatherBounds(),
    deps.getStoredNriVersions(),
  ]);
  if (!snapshots || activeSnapshots(hubs, snapshots).length === 0 || !weatherBounds) {
    throw new BoundaryError({
      name: "NoDataError",
      message: "No scores for the active hubs yet — run `npm run ingest` first",
      functionName: "loadWidgetsData",
      boundary: "database",
    });
  }
  const mismatched = femaVersions.filter((v) => v !== FEMA_ANCHORS_NRI_VERSION);
  if (mismatched.length > 0) {
    deps.log(
      formatBoundaryMessage({
        name: "FemaVersionMismatch",
        message: `Stored FEMA data is NRI '${femaVersions.join("', '")}', but the scoring anchors were computed from '${FEMA_ANCHORS_NRI_VERSION}' — recompute them with npm run fema:anchors`,
        functionName: "loadWidgetsData",
        boundary: "database",
      }),
    );
  }
  return buildWidgetsData({ hubs, snapshots, weatherBounds, femaVersions });
}
