/**
 * @module evals/lib/helpers
 *
 * Small formatting and grouping helpers shared by the eval reports and scripts.
 */

/**
 * Formats a number to fixed decimals.
 * @param n - the number.
 * @param decimals - digits after the point (default 1).
 * @returns e.g. "12.3".
 */
export function fixed(n: number, decimals = 1): string {
  return n.toFixed(decimals);
}

/**
 * A date as "YYYY-MM-DD HH:MM UTC", the stamp written at the top of the published reports.
 * @param date - the moment (default: now).
 * @returns the stamp.
 */
export function utcMinuteStamp(date: Date = new Date()): string {
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/**
 * Groups items by a key, keeping first-seen order.
 * @param items - the items.
 * @param key - the group key of an item.
 * @returns key → items.
 */
export function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group) group.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}
