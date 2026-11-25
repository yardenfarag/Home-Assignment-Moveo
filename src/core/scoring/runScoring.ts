/**
 * @module core/scoring/runScoring
 *
 * Scores every active hub and saves one snapshot per hub (D54). Runs at the
 * end of each ingest (same run id) and on demand via `npm run score`.
 * I/O is injected, so the pure scoring stays pure and this stays testable.
 */
import { randomUUID } from "node:crypto";
import type { NewEvent } from "../db/eventsRepository";
import type { SnapshotToSave, StoredSnapshot } from "../db/scoresRepository";
import type { Hub } from "../domain/hub";
import type { DailyWeather } from "../domain/weather";
import { alertEvent, detectScoreChanges } from "../alerts/scoreChanges";
import { describeUnknownError, formatBoundaryMessage } from "../errors/boundaryError";
import { SCORING_VERSION } from "./config";
import { computeObservedSignals, scoringWindow } from "./observedSignals";
import { scoreHub } from "./scoreHub";
import type { Confidence, FemaSignals, RiskLevel } from "./types";

/** Everything scoring needs from the outside world. */
export interface ScoringDeps {
  listActiveHubs: () => Promise<Hub[]>;
  getLatestWeatherDate: (hubId: string) => Promise<string | null>;
  getWeatherDays: (hubId: string, startDate: string, endDate: string) => Promise<DailyWeather[]>;
  getFemaSignalsByHub: () => Promise<{ signals: Map<string, FemaSignals>; problems: Map<string, string> }>;
  saveScoreSnapshots: (snapshots: SnapshotToSave[]) => Promise<number>;
  /** The latest saved snapshots of the current scoring version (the alert baseline, D124). */
  getLatestSnapshots: () => Promise<StoredSnapshot[] | null>;
  recordEvent: (event: NewEvent) => Promise<boolean>;
  log: (line: string) => void;
}

/** Options for one scoring run. */
export interface ScoringOptions {
  trigger: "cli" | "cron" | "ingest";
  /** Reuse the ingest run id so one id covers fetch + score. A new id is made otherwise. */
  runId?: string;
}

/** What happened to one hub. */
export interface HubScoringResult {
  hubId: string;
  overallScore?: number;
  riskLevel?: RiskLevel;
  confidence?: Confidence;
  /** Non-fatal problem (e.g. unusable FEMA row). */
  warning?: string;
  /** Fatal problem: hub not scored. */
  error?: string;
}

/** Summary of a scoring run. */
export interface ScoringSummary {
  runId: string;
  scoringVersion: string;
  hubsScored: number;
  hubsFailed: number;
  /** Score-change alerts raised by this run (D124). */
  alerts: number;
  results: HubScoringResult[];
}

/**
 * The previous run's results for the same scoring version, for the alert comparison.
 * A failure here never stops scoring: alerts are skipped for this run and the problem logged.
 * @param deps - scoring dependencies.
 * @returns results by hub id, or null when unavailable.
 */
async function previousResults(deps: ScoringDeps): Promise<Map<string, { hubId: string; overallScore: number; riskLevel: RiskLevel }> | null> {
  try {
    const snapshots = await deps.getLatestSnapshots();
    if (!snapshots) return null;
    return new Map(snapshots.map((s) => [s.hubId, { hubId: s.hubId, overallScore: s.overallScore, riskLevel: s.riskLevel }]));
  } catch (error) {
    deps.log(
      formatBoundaryMessage({
        name: "AlertBaselineError",
        message: `Could not read the previous scores, so no alerts this run: ${describeUnknownError(error)}`,
        functionName: "runScoring",
        boundary: "database",
      }),
    );
    return null;
  }
}

/**
 * Scores all active hubs and saves the snapshots.
 * @param options - trigger and optional run id.
 * @param deps - injected I/O.
 * @returns the run summary (also stored as the `scoring.finished` event).
 * @throws only if the hub list, FEMA table or the final save fail; per-hub problems are recorded.
 */
export async function runScoring(options: ScoringOptions, deps: ScoringDeps): Promise<ScoringSummary> {
  const runId = options.runId ?? randomUUID();
  await deps.recordEvent({
    eventType: "scoring.started",
    source: "scoring",
    correlationId: runId,
    payload: { trigger: options.trigger, scoringVersion: SCORING_VERSION },
  });

  const hubs = await deps.listActiveHubs();
  const { signals: femaByHub, problems: femaProblems } = await deps.getFemaSignalsByHub();
  const previous = await previousResults(deps);
  const snapshots: SnapshotToSave[] = [];
  const results: HubScoringResult[] = [];

  for (const hub of hubs) {
    const result: HubScoringResult = { hubId: hub.id, warning: femaProblems.get(hub.id) };
    try {
      const latest = await deps.getLatestWeatherDate(hub.id);
      if (latest === null) throw new Error("no weather data stored yet (run the ingest first)");
      const window = scoringWindow(latest);
      const observed = computeObservedSignals(await deps.getWeatherDays(hub.id, window.start, window.end), window);
      const score = scoreHub(observed, femaByHub.get(hub.id) ?? null);
      snapshots.push({ hubId: hub.id, runId, window, score, observedPerYear: observed.perYear, coverage: observed.coverage });
      Object.assign(result, { overallScore: score.overallScore, riskLevel: score.riskLevel, confidence: score.confidence });
      deps.log(`   ${hub.name.padEnd(16)} ${String(score.overallScore).padStart(5)} ${score.riskLevel.padEnd(6)} top=${score.topHazard} conf=${score.confidence}`);
    } catch (error) {
      result.error = describeUnknownError(error);
      deps.log(`   ❌ ${hub.name}: ${result.error}`);
      await deps.recordEvent({
        eventType: "scoring.hub_failed",
        source: "scoring",
        level: "error",
        correlationId: runId,
        hubId: hub.id,
        message: result.error,
      });
    }
    results.push(result);
  }

  await deps.saveScoreSnapshots(snapshots);

  // Score-change alerts (D124): the "if" lives in detectScoreChanges.
  const hubName = new Map(hubs.map((hub) => [hub.id, hub.name]));
  const alerts = previous
    ? detectScoreChanges(
        previous,
        snapshots.map((s) => ({ hubId: s.hubId, hubName: hubName.get(s.hubId) ?? s.hubId, overallScore: s.score.overallScore, riskLevel: s.score.riskLevel })),
      )
    : [];
  for (const alert of alerts) {
    deps.log(`   🔔 ${alert.hubName}: ${alert.fromScore} → ${alert.toScore} (${alert.fromLevel} → ${alert.toLevel})`);
    await deps.recordEvent(alertEvent(alert, runId));
  }

  const summary: ScoringSummary = {
    runId,
    scoringVersion: SCORING_VERSION,
    hubsScored: snapshots.length,
    hubsFailed: results.filter((r) => r.error).length,
    alerts: alerts.length,
    results,
  };
  const count = (level: RiskLevel) => results.filter((r) => r.riskLevel === level).length;
  await deps.recordEvent({
    eventType: "scoring.finished",
    source: "scoring",
    level: summary.hubsFailed > 0 ? "warn" : "info",
    correlationId: runId,
    message: `${summary.hubsScored} hubs scored (${count("high")} high, ${count("medium")} medium, ${count("low")} low), ${summary.hubsFailed} failed`,
    payload: {
      scoringVersion: SCORING_VERSION,
      hubsScored: summary.hubsScored,
      hubsFailed: summary.hubsFailed,
      alerts: summary.alerts,
      levels: { high: count("high"), medium: count("medium"), low: count("low") },
    },
  });
  return summary;
}
