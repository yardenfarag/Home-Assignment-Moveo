/**
 * @module core/widgets/loadWidgetsData
 *
 * Loads what the widgets need from the database and builds their data.
 */
import { listActiveHubs } from "../db/hubsRepository";
import { getLatestSnapshots } from "../db/scoresRepository";
import { getWeatherBounds } from "../db/weatherRepository";
import { BoundaryError } from "../errors/boundaryError";
import { buildWidgetsData, type WidgetsData } from "./widgetsData";

/**
 * Reads hubs, latest snapshots and the weather date range, then builds the widget data.
 * @returns the widget data.
 * @throws BoundaryError (database) — `NoDataError` when nothing has been scored yet.
 */
export async function loadWidgetsData(): Promise<WidgetsData> {
  const [hubs, snapshots, weatherBounds] = await Promise.all([listActiveHubs(), getLatestSnapshots(), getWeatherBounds()]);
  if (!snapshots || snapshots.length === 0 || !weatherBounds) {
    throw new BoundaryError({
      name: "NoDataError",
      message: "No scores yet — run `npm run ingest` first",
      functionName: "loadWidgetsData",
      boundary: "database",
    });
  }
  return buildWidgetsData({ hubs, snapshots, weatherBounds });
}
