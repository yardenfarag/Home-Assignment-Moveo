/**
 * @module core/scoring/ranking
 *
 * Ranks are DERIVED when read, never stored (D54), so they can't go stale when
 * hubs are added. Rank 1 = most exposed. Ties share a rank ("1, 2, 2, 4").
 */
import type { CensusRegion } from "../domain/hub";
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
 * Standard competition ranking on score, highest first.
 * @param items - ids with scores.
 * @returns id → rank.
 */
export function competitionRanks(items: { id: string; score: number }[]): Map<string, number> {
  const sorted = [...items].sort((a, b) => b.score - a.score);
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
    .sort((a, b) => (options.order === "most" ? b.score - a.score : a.score - b.score));
  return ranked.slice(0, options.limit);
}
