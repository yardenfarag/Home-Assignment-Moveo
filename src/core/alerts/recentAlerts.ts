/**
 * @module core/alerts/recentAlerts
 *
 * Reads recent score-change alerts back for the app (D124), and creates the clearly
 * marked TEST alert used to demo the feature (`npm run alerts:test`). Real alerts are
 * never faked: a test alert carries `test: true` and the app labels it as a test.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { NewEvent, StoredEvent } from "../db/eventsRepository";
import type { StoredSnapshot } from "../db/scoresRepository";
import { riskLevelFor } from "../scoring/overall";
import { RISK_LEVELS } from "../scoring/types";
import { ALERT_EVENT, ALERT_RULES, alertEvent, type ScoreChangeAlert } from "./scoreChanges";

/** An alert as the app receives it. */
export interface RecentAlert extends ScoreChangeAlert {
  /** The event id: stable, used to remember a dismissal in the browser. */
  id: string;
  createdAt: string;
}

/** The stored payload of an alert event (validated on the way out). */
const alertPayloadSchema = z.object({
  hubId: z.string(),
  hubName: z.string(),
  fromScore: z.number(),
  toScore: z.number(),
  change: z.number(),
  fromLevel: z.enum(RISK_LEVELS),
  toLevel: z.enum(RISK_LEVELS),
  test: z.boolean(),
});

/** What reading alerts needs (injectable for tests). */
export interface RecentAlertsDeps {
  listEvents: (query: { eventType: string; since: string; limit: number }) => Promise<StoredEvent[]>;
  now: () => Date;
}

/**
 * The alerts of the last 30 days, newest first. Malformed rows are skipped.
 * @param deps - event reader and clock.
 * @returns the alerts.
 */
export async function loadRecentAlerts(deps: RecentAlertsDeps): Promise<RecentAlert[]> {
  const since = new Date(deps.now().getTime() - ALERT_RULES.showDays * 86_400_000).toISOString();
  const events = await deps.listEvents({ eventType: ALERT_EVENT, since, limit: 20 });
  return events.flatMap((event) => {
    const parsed = alertPayloadSchema.safeParse(event.payload);
    return parsed.success ? [{ ...parsed.data, id: event.id, createdAt: event.createdAt }] : [];
  });
}

/**
 * Builds the TEST alert: the top hub's real current score, shown as if it had risen
 * by exactly the alert threshold, marked `test: true`.
 * @param snapshots - the latest snapshots.
 * @param hubName - hub id → display name.
 * @returns the event to record, or null when there are no scores yet.
 */
export function testAlertEvent(snapshots: readonly StoredSnapshot[], hubName: (hubId: string) => string): NewEvent | null {
  const top = [...snapshots].sort((a, b) => b.overallScore - a.overallScore)[0];
  if (!top) return null;
  const fromScore = Math.max(0, Math.round((top.overallScore - ALERT_RULES.scoreChangePoints) * 10) / 10);
  const alert: ScoreChangeAlert = {
    hubId: top.hubId,
    hubName: hubName(top.hubId),
    fromScore,
    toScore: top.overallScore,
    change: Math.round((top.overallScore - fromScore) * 10) / 10,
    fromLevel: riskLevelFor(fromScore),
    toLevel: top.riskLevel,
    test: true,
  };
  return alertEvent(alert, randomUUID()); // correlation_id is a uuid column; the payload marks it as a test
}
