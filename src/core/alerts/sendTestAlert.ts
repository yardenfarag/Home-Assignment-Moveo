/**
 * @module core/alerts/sendTestAlert
 *
 * Records one clearly marked TEST alert through the same path as real alerts (D124),
 * so the feature can be demoed even when no score has really changed.
 * Used by `npm run alerts:test` and `POST /api/alerts/test` (cron secret required).
 */
import { recordEvent } from "../db/eventsRepository";
import { listActiveHubs } from "../db/hubsRepository";
import { getLatestSnapshots } from "../db/scoresRepository";
import { BoundaryError } from "../errors/boundaryError";
import { testAlertEvent } from "./recentAlerts";

/**
 * Records the test alert.
 * @returns the alert's message.
 * @throws BoundaryError (database) when there are no scores yet or the event can't be saved.
 */
export async function sendTestAlert(): Promise<string> {
  const [hubs, snapshots] = await Promise.all([listActiveHubs(), getLatestSnapshots()]);
  const names = new Map(hubs.map((hub) => [hub.id, hub.name]));
  const event = testAlertEvent(snapshots ?? [], (id) => names.get(id) ?? id);
  if (!event || !(await recordEvent(event))) {
    throw new BoundaryError({ name: "TestAlertError", message: "Could not record the test alert (no scores yet, or the insert failed)", functionName: "sendTestAlert", boundary: "database" });
  }
  return event.message ?? "test alert recorded";
}
