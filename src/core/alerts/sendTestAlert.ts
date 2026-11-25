/**
 * @module core/alerts/sendTestAlert
 *
 * Records one clearly marked TEST alert through the same path as real alerts (D124),
 * so the feature can be demoed even when no score has really changed.
 * Used by `npm run alerts:test` and `POST /api/alerts/test` (cron secret required).
 */
import { recordEvent, type NewEvent } from "../db/eventsRepository";
import { listActiveHubs } from "../db/hubsRepository";
import { getLatestSnapshots, type StoredSnapshot } from "../db/scoresRepository";
import type { Hub } from "../domain/hub";
import { BoundaryError } from "../errors/boundaryError";
import { testAlertEvent } from "./recentAlerts";

/** What sending the test alert needs (injectable for tests; defaults to the real database). */
export interface SendTestAlertDeps {
  /** The active hubs (for display names). */
  listActiveHubs: () => Promise<Hub[]>;
  /** The latest snapshot per hub (null when nothing is scored yet). */
  getLatestSnapshots: () => Promise<StoredSnapshot[] | null>;
  /** Records the alert event; false when the insert failed. */
  recordEvent: (event: NewEvent) => Promise<boolean>;
}

/** The real database reads and writes. */
const defaultDeps: SendTestAlertDeps = {
  listActiveHubs: () => listActiveHubs(),
  getLatestSnapshots: () => getLatestSnapshots(),
  recordEvent: (event) => recordEvent(event),
};

/**
 * Records the test alert.
 * @param deps - data sources (default: the database).
 * @returns the alert's message.
 * @throws BoundaryError (database) — `NoDataError` when there are no scores yet, `TestAlertError` when the event can't be saved.
 */
export async function sendTestAlert(deps: SendTestAlertDeps = defaultDeps): Promise<string> {
  const [hubs, snapshots] = await Promise.all([deps.listActiveHubs(), deps.getLatestSnapshots()]);
  const names = new Map(hubs.map((hub) => [hub.id, hub.name]));
  const event = testAlertEvent(snapshots ?? [], (id) => names.get(id) ?? id);
  if (!event) {
    throw new BoundaryError({ name: "NoDataError", message: "No scores yet, so there is no hub to base the test alert on — run `npm run ingest` first", functionName: "sendTestAlert", boundary: "database" });
  }
  if (!(await deps.recordEvent(event))) {
    throw new BoundaryError({ name: "TestAlertError", message: "Could not record the test alert: the event insert failed (see the EventInsertError line above)", functionName: "sendTestAlert", boundary: "database" });
  }
  return event.message ?? "test alert recorded";
}
