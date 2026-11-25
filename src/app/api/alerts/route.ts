/**
 * GET /api/alerts — score-change alerts of the last 30 days, newest first (D124).
 * Deterministic, no LLM. The browser remembers which ones it dismissed.
 */
import { connection } from "next/server";
import { loadRecentAlerts } from "@/core/alerts/recentAlerts";
import { listEvents } from "@/core/db/eventsRepository";
import { failure, json } from "../_lib/http";

/**
 * Returns the recent alerts.
 * @returns `{ alerts: RecentAlert[] }` or a friendly error.
 */
export async function GET(): Promise<Response> {
  await connection(); // always per-request: never prerender (Cache Components), and keep it outside the try/catch
  try {
    return json({ alerts: await loadRecentAlerts({ listEvents: (query) => listEvents(query), now: () => new Date() }) });
  } catch (error) {
    return failure(error, "GET /api/alerts");
  }
}
