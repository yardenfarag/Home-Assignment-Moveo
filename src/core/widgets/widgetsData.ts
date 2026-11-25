/**
 * @module core/widgets/widgetsData
 *
 * Data for the dashboard widgets (A5) — computed in code from the latest
 * snapshots, no LLM involved: top hubs, the leader per hazard, data freshness.
 * Ties are broken by hub name (many hubs sit at 100 on some hazards), and the
 * freshness block says honestly when some hubs' data is older than others'.
 */
import type { StoredSnapshot } from "../db/scoresRepository";
import type { Hub } from "../domain/hub";
import { FEMA_ANCHORS_NRI_VERSION } from "../scoring/config";
import { riskLevelFor } from "../scoring/overall";
import { competitionRanks } from "../scoring/ranking";
import { dataFreshness } from "../scoring/staleness";
import { HAZARDS, type Confidence, type Hazard, type RiskLevel } from "../scoring/types";
import type { DataBounds } from "../stats/weatherStats";

/** Inputs for the widgets. */
export interface WidgetsInput {
  hubs: Hub[];
  snapshots: StoredSnapshot[];
  weatherBounds: DataBounds;
  /** The NRI versions of the stored FEMA records (`fema_nri.nri_version`), normally one. */
  femaVersions: string[];
}

/** Everything the widget column shows. */
export interface WidgetsData {
  topHubs: {
    hubId: string;
    hub: string;
    rank: number;
    score: number;
    level: RiskLevel;
    topHazard: Hazard;
    confidence: Confidence;
  }[];
  hazardLeaders: {
    hazard: Hazard;
    hubId: string;
    hub: string;
    score: number;
    level: RiskLevel;
    /** How many OTHER hubs have exactly the leader's score (e.g. "and 6 more hubs at 100"). */
    tiedWith: number;
  }[];
  dataStatus: {
    weatherFrom: string;
    /** The newest stored weather day of any hub. */
    weatherThrough: string;
    hubCount: number;
    scoredAt: string;
    scoringVersion: string;
    scoringWindow: { start: string; end: string };
    /** The stored FEMA data's version, e.g. "FEMA National Risk Index (December 2025)". */
    femaVersion: string;
    /** False when the stored FEMA data's version differs from the one the scoring anchors were computed from. */
    femaVersionMatchesAnchors: boolean;
    /** The oldest window end among the hubs' scores: "weather through" is only this date for every hub. */
    oldestWindowEnd: string;
    /** Hubs whose score uses data more than STALE_DATA_DAYS older than the newest hub's, most behind first. */
    staleHubs: { hubId: string; hub: string; windowEnd: string; daysBehind: number; scoredAt: string }[];
  };
}

/** How many hubs the "top hubs" widget shows. */
export const TOP_HUBS_COUNT = 5;

/**
 * The snapshots that belong to active hubs.
 * @param hubs - the active hubs.
 * @param snapshots - the latest snapshots.
 * @returns the snapshots of active hubs only.
 */
export function activeSnapshots(hubs: readonly Hub[], snapshots: readonly StoredSnapshot[]): StoredSnapshot[] {
  const active = new Set(hubs.map((h) => h.id));
  return snapshots.filter((s) => active.has(s.hubId));
}

/**
 * Builds the widget data.
 * @param input - active hubs, latest snapshots, weather date range and stored FEMA versions.
 * @returns top hubs, hazard leaders and data status.
 * @throws Error when no snapshot belongs to an active hub (callers check with {@link activeSnapshots} first).
 */
export function buildWidgetsData({ hubs, snapshots, weatherBounds, femaVersions }: WidgetsInput): WidgetsData {
  const hubById = new Map(hubs.map((h) => [h.id, h]));
  const active = activeSnapshots(hubs, snapshots);
  if (active.length === 0) throw new Error("No snapshots of active hubs to build widgets from.");
  /**
   * The display label of a hub.
   * @param hubId - hub slug.
   * @returns "Name, ST".
   */
  const label = (hubId: string) => `${hubById.get(hubId)!.name}, ${hubById.get(hubId)!.state}`;
  /**
   * Orders by score (highest first), then by hub name, then id — so ties are listed the same way every time.
   * @param score - the score to sort by.
   * @returns a comparator.
   */
  const byScoreThenName = (score: (s: StoredSnapshot) => number) => (a: StoredSnapshot, b: StoredSnapshot) =>
    score(b) - score(a) || label(a.hubId).localeCompare(label(b.hubId)) || a.hubId.localeCompare(b.hubId);
  const ranks = competitionRanks(active.map((s) => ({ id: s.hubId, score: s.overallScore })));

  const topHubs = [...active]
    .sort(byScoreThenName((s) => s.overallScore))
    .slice(0, TOP_HUBS_COUNT)
    .map((s) => ({
      hubId: s.hubId,
      hub: label(s.hubId),
      rank: ranks.get(s.hubId)!,
      score: s.overallScore,
      level: s.riskLevel,
      topHazard: s.topHazard,
      confidence: s.confidence,
    }));

  const hazardLeaders = HAZARDS.map((hazard) => {
    const leader = [...active].sort(byScoreThenName((s) => s.hazards[hazard].score))[0];
    const score = leader.hazards[hazard].score;
    const tiedWith = active.filter((s) => s.hubId !== leader.hubId && s.hazards[hazard].score === score).length;
    return { hazard, hubId: leader.hubId, hub: label(leader.hubId), score, level: riskLevelFor(score), tiedWith };
  });

  const newest = active.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
  const freshness = dataFreshness(active.map((s) => ({ hubId: s.hubId, windowEnd: s.window.end })))!;
  const snapshotByHub = new Map(active.map((s) => [s.hubId, s]));
  return {
    topHubs,
    hazardLeaders,
    dataStatus: {
      weatherFrom: weatherBounds.earliest,
      weatherThrough: weatherBounds.latest,
      hubCount: active.length,
      scoredAt: newest.createdAt,
      scoringVersion: newest.scoringVersion,
      scoringWindow: newest.window,
      femaVersion: `FEMA National Risk Index (${femaVersions.length > 0 ? femaVersions.join(", ") : "version unknown"})`,
      femaVersionMatchesAnchors: femaVersions.length > 0 && femaVersions.every((v) => v === FEMA_ANCHORS_NRI_VERSION),
      oldestWindowEnd: freshness.oldestWindowEnd,
      staleHubs: freshness.staleHubs.map((s) => ({ ...s, hub: label(s.hubId), scoredAt: snapshotByHub.get(s.hubId)!.createdAt })),
    },
  };
}
