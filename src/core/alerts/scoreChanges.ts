/**
 * @module core/alerts/scoreChanges
 *
 * Score-change alerts (Step 13, bonus, D124). After every scoring run (the nightly job
 * fetches new weather, then re-scores), each hub's new overall score is compared with
 * its previous one. An alert fires when the risk LEVEL changes or the score moves by
 * 10+ points. Both snapshots always come from the same scoring version (D22), so a
 * formula change never looks like a weather change.
 *
 * Alerts are stored as `alert.score_changed` events (no new table, D34). The app shows
 * them in a "Recent changes" card with a dismiss button (remembered per browser).
 * Pure functions only; the scoring run does the I/O.
 */
import type { NewEvent } from "../db/eventsRepository";
import type { RiskLevel } from "../scoring/types";

/** The alert rule: the single source of truth. */
export const ALERT_RULES = {
  /** Fire when the overall score moves by at least this many points. */
  scoreChangePoints: 10,
  /** How far back the app shows alerts. */
  showDays: 30,
} as const;

/** Event type for real alerts and for the clearly marked test alert. */
export const ALERT_EVENT = "alert.score_changed";

/** One hub's overall result in a scoring run. */
export interface HubResult {
  hubId: string;
  hubName: string;
  overallScore: number;
  riskLevel: RiskLevel;
}

/** A score-change alert. */
export interface ScoreChangeAlert {
  hubId: string;
  hubName: string;
  fromScore: number;
  toScore: number;
  /** toScore − fromScore, rounded to 0.1. */
  change: number;
  fromLevel: RiskLevel;
  toLevel: RiskLevel;
  /** True for the demo alert from `npm run alerts:test`, never for a real change. */
  test: boolean;
}

/**
 * Compares each hub's new result with its previous one and returns the alerts.
 * Hubs without a previous result (e.g. newly added) never alert.
 * @param previous - previous results by hub id (same scoring version).
 * @param current - this run's results.
 * @returns one alert per hub whose level changed or whose score moved 10+ points.
 */
export function detectScoreChanges(previous: ReadonlyMap<string, Omit<HubResult, "hubName">>, current: readonly HubResult[]): ScoreChangeAlert[] {
  const alerts: ScoreChangeAlert[] = [];
  for (const now of current) {
    const before = previous.get(now.hubId);
    if (!before) continue;
    const change = Math.round((now.overallScore - before.overallScore) * 10) / 10;
    if (now.riskLevel !== before.riskLevel || Math.abs(change) >= ALERT_RULES.scoreChangePoints) {
      alerts.push({
        hubId: now.hubId,
        hubName: now.hubName,
        fromScore: before.overallScore,
        toScore: now.overallScore,
        change,
        fromLevel: before.riskLevel,
        toLevel: now.riskLevel,
        test: false,
      });
    }
  }
  return alerts;
}

/**
 * The event that stores an alert.
 * @param alert - the alert.
 * @param runId - the scoring run that produced it.
 * @returns the event to record.
 */
export function alertEvent(alert: ScoreChangeAlert, runId: string): NewEvent {
  const levelText = alert.fromLevel === alert.toLevel ? alert.toLevel : `${alert.fromLevel} → ${alert.toLevel}`;
  return {
    eventType: ALERT_EVENT,
    source: "scoring",
    level: "warn",
    correlationId: runId,
    hubId: alert.hubId,
    message: `${alert.test ? "TEST: " : ""}${alert.hubName} ${alert.fromScore} → ${alert.toScore} (${alert.change > 0 ? "+" : ""}${alert.change}), ${levelText}`,
    payload: { ...alert },
  };
}
