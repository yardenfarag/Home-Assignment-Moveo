/**
 * @module core/scoring/staleness
 *
 * Each hub's score is built on a window ending at ITS newest weather day, so a hub whose
 * ingest keeps failing quietly falls behind the others. This finds those hubs, so the
 * widgets and the agent can say so instead of showing one "weather through" date for all.
 */
import { STALE_DATA_DAYS } from "../config/ingestConfig";
import { daysInclusive } from "../utils/dates";

/** A hub whose data ends noticeably earlier than the newest hub's. */
export interface StaleHub {
  hubId: string;
  /** The hub's newest weather day used in its score. */
  windowEnd: string;
  /** How many days behind the newest hub it is. */
  daysBehind: number;
}

/** Freshness across hubs. */
export interface DataFreshness {
  /** The newest window end among the hubs. */
  newestWindowEnd: string;
  /** The oldest window end among the hubs. */
  oldestWindowEnd: string;
  /** Hubs more than {@link STALE_DATA_DAYS} days behind the newest, most behind first. */
  staleHubs: StaleHub[];
}

/**
 * Compares the hubs' window ends.
 * @param entries - each hub's id and window end (`YYYY-MM-DD`).
 * @param staleAfterDays - how many days behind still count as fresh.
 * @returns the freshness summary, or null for an empty list.
 */
export function dataFreshness(entries: readonly { hubId: string; windowEnd: string }[], staleAfterDays: number = STALE_DATA_DAYS): DataFreshness | null {
  if (entries.length === 0) return null;
  const ends = entries.map((e) => e.windowEnd).sort();
  const newestWindowEnd = ends[ends.length - 1];
  const staleHubs = entries
    .map((e) => ({ hubId: e.hubId, windowEnd: e.windowEnd, daysBehind: daysInclusive(e.windowEnd, newestWindowEnd) - 1 }))
    .filter((e) => e.daysBehind > staleAfterDays)
    .sort((a, b) => b.daysBehind - a.daysBehind || a.hubId.localeCompare(b.hubId));
  return { newestWindowEnd, oldestWindowEnd: ends[0], staleHubs };
}
