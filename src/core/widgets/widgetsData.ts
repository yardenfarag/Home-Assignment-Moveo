/**
 * @module core/widgets/widgetsData
 *
 * Data for the dashboard widgets (A5) — computed in code from the latest
 * snapshots, no LLM involved: top hubs, the leader per hazard, data freshness.
 */
import type { StoredSnapshot } from "../db/scoresRepository";
import type { Hub } from "../domain/hub";
import { FEMA_ANCHORS_NRI_VERSION } from "../scoring/config";
import { riskLevelFor } from "../scoring/overall";
import { competitionRanks } from "../scoring/ranking";
import { HAZARDS, type Confidence, type Hazard, type RiskLevel } from "../scoring/types";
import type { DataBounds } from "../stats/weatherStats";

/** Inputs for the widgets. */
export interface WidgetsInput {
  hubs: Hub[];
  snapshots: StoredSnapshot[];
  weatherBounds: DataBounds;
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
  hazardLeaders: { hazard: Hazard; hubId: string; hub: string; score: number; level: RiskLevel }[];
  dataStatus: {
    weatherFrom: string;
    weatherThrough: string;
    hubCount: number;
    scoredAt: string;
    scoringVersion: string;
    scoringWindow: { start: string; end: string };
    femaVersion: string;
  };
}

/** How many hubs the "top hubs" widget shows. */
export const TOP_HUBS_COUNT = 5;

/**
 * Builds the widget data.
 * @param input - active hubs, latest snapshots and weather date range.
 * @returns top hubs, hazard leaders and data status.
 * @throws Error when there are no snapshots.
 */
export function buildWidgetsData({ hubs, snapshots, weatherBounds }: WidgetsInput): WidgetsData {
  if (snapshots.length === 0) throw new Error("No snapshots to build widgets from.");
  const hubById = new Map(hubs.map((h) => [h.id, h]));
  const active = snapshots.filter((s) => hubById.has(s.hubId));
  const label = (hubId: string) => `${hubById.get(hubId)!.name}, ${hubById.get(hubId)!.state}`;
  const ranks = competitionRanks(active.map((s) => ({ id: s.hubId, score: s.overallScore })));

  const topHubs = [...active]
    .sort((a, b) => b.overallScore - a.overallScore)
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
    const leader = active.reduce((best, s) => (s.hazards[hazard].score > best.hazards[hazard].score ? s : best));
    const score = leader.hazards[hazard].score;
    return { hazard, hubId: leader.hubId, hub: label(leader.hubId), score, level: riskLevelFor(score) };
  });

  const newest = active.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
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
      femaVersion: `FEMA National Risk Index (${FEMA_ANCHORS_NRI_VERSION})`,
    },
  };
}
