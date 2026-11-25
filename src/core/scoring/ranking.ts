/**
 * @module core/scoring/ranking
 *
 * Ranks are DERIVED when read, never stored (D54), so they can't go stale when
 * hubs are added. Rank 1 = most exposed. Ties share a rank ("1, 2, 2, 4").
 */
import type { CensusRegion } from "../domain/hub";
import { round } from "../utils/stats";
import type { Hazard } from "./types";

/** What to rank by: the overall score or one hazard. */
export type RankMetric = "overall" | Hazard;

/** The minimum a row needs to be ranked. */
export interface RankableRow {
  hubId: string;
  region: CensusRegion;
  scores: Partial<Record<RankMetric, number>> & { overall: number };
}

/** One ranked row. */
export interface RankedRow {
  hubId: string;
  score: number;
  /** Rank among all hubs (1 = most exposed). */
  rankAmongAll: number;
  totalHubs: number;
  /** Rank within the filtered selection (e.g. within the Midwest). */
  rankInSelection: number;
  selectionSize: number;
}

/**
 * Standard competition ranking on score, highest first. Equal scores share a rank.
 * @param items - ids with scores.
 * @returns id → rank.
 */
export function competitionRanks(items: { id: string; score: number }[]): Map<string, number> {
  const sorted = [...items].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const ranks = new Map<string, number>();
  sorted.forEach((item, index) => {
    const previous = sorted[index - 1];
    ranks.set(item.id, previous && previous.score === item.score ? ranks.get(previous.id)! : index + 1);
  });
  return ranks;
}

/**
 * Ranks hubs by a metric, optionally within a region.
 * @param rows - every hub's scores (the full set, so "rank among all" is correct).
 * @param options - metric, optional region filter, order and limit.
 * @returns the requested slice, most or least exposed first.
 */
export function rankHubs(
  rows: RankableRow[],
  options: { metric: RankMetric; region?: CensusRegion; order: "most" | "least"; limit: number },
): RankedRow[] {
  const scoreOf = (row: RankableRow) => row.scores[options.metric] ?? 0;
  const allRanks = competitionRanks(rows.map((row) => ({ id: row.hubId, score: scoreOf(row) })));
  const selection = options.region ? rows.filter((row) => row.region === options.region) : rows;
  const selectionRanks = competitionRanks(selection.map((row) => ({ id: row.hubId, score: scoreOf(row) })));

  const ranked = selection
    .map((row) => ({
      hubId: row.hubId,
      score: scoreOf(row),
      rankAmongAll: allRanks.get(row.hubId)!,
      totalHubs: rows.length,
      rankInSelection: selectionRanks.get(row.hubId)!,
      selectionSize: selection.length,
    }))
    // Equal scores (many hubs sit at 100) are listed by hub id, so the order never depends on the input order.
    .sort((a, b) => (options.order === "most" ? b.score - a.score : a.score - b.score) || a.hubId.localeCompare(b.hubId));
  return ranked.slice(0, options.limit);
}

/** Who is highest/lowest among some hubs and how many points apart they are. */
export interface ScoreSpread {
  highestHubId: string;
  lowestHubId: string;
  /** highest − lowest, rounded to 1 decimal. */
  spread: number;
}

/**
 * Gap between the highest and lowest score (E10): computed in code so the agent
 * can quote "4.3 points apart" without doing arithmetic itself.
 * @param entries - hub ids with scores.
 * @returns the spread, or null for fewer than two entries.
 */
export function scoreSpread(entries: { hubId: string; score: number }[]): ScoreSpread | null {
  if (entries.length < 2) return null;
  const sorted = [...entries].sort((a, b) => b.score - a.score || a.hubId.localeCompare(b.hubId));
  const highest = sorted[0];
  const lowest = sorted[sorted.length - 1];
  return { highestHubId: highest.hubId, lowestHubId: lowest.hubId, spread: round(highest.score - lowest.score, 1) };
}
