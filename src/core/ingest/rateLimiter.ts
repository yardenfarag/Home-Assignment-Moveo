/**
 * @module core/ingest/rateLimiter
 *
 * Keeps Open-Meteo requests under its per-minute, per-hour and per-day limits.
 * Each request has a *weight* (long date ranges count as several calls), so
 * this is a sliding-window limiter over weighted calls.
 *
 * Note: history lives in memory, so it protects one process run. That's enough
 * because the full load is a single run and the nightly run is tiny.
 */
import { sleep as defaultSleep, type SleepFn } from "../data/http";

/** Max weighted calls per window. */
export interface RateLimits {
  perMinute: number;
  perHour: number;
  perDay: number;
}

/** One past request: when it was made and how much it weighed. */
export interface CallRecord {
  at: number;
  weight: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How long to wait before a request of `weight` can go out without breaking any limit.
 * Pure function: no clock, no side effects.
 * @param history - previous calls (any order).
 * @param now - current time in ms.
 * @param weight - weight of the request we want to make.
 * @param limits - window limits.
 * @returns milliseconds to wait (0 = go now).
 * @throws Error when a single request is heavier than a whole window allows.
 */
export function computeWaitMs(history: CallRecord[], now: number, weight: number, limits: RateLimits): number {
  const windows: [number, number][] = [
    [MINUTE, limits.perMinute],
    [HOUR, limits.perHour],
    [DAY, limits.perDay],
  ];
  let wait = 0;
  for (const [length, limit] of windows) {
    if (weight > limit) throw new Error(`Request weight ${weight} exceeds the ${length / MINUTE}-minute limit ${limit}`);
    // Oldest first: drop calls until the remaining ones leave room for this request.
    const inWindow = history.filter((call) => call.at > now - length).sort((a, b) => a.at - b.at);
    let used = inWindow.reduce((sum, call) => sum + call.weight, 0);
    for (const call of inWindow) {
      if (used + weight <= limit) break;
      used -= call.weight;
      wait = Math.max(wait, call.at + length - now);
    }
  }
  return wait;
}

/** Stateful limiter used by the ingest run. */
export class WeightedRateLimiter {
  private readonly history: CallRecord[] = [];

  /**
   * @param limits - window limits.
   * @param clock - returns the current time (injectable for tests).
   * @param sleepImpl - waits (injectable for tests).
   * @param onWait - called before each wait, e.g. to print progress.
   */
  constructor(
    private readonly limits: RateLimits,
    private readonly clock: () => number = Date.now,
    private readonly sleepImpl: SleepFn = defaultSleep,
    private readonly onWait: (ms: number) => void = () => {},
  ) {}

  /**
   * Waits until a request of `weight` is allowed, then records it.
   * @param weight - weighted call count of the upcoming request.
   * @returns the milliseconds waited.
   */
  async acquire(weight: number): Promise<number> {
    const wait = computeWaitMs(this.history, this.clock(), weight, this.limits);
    if (wait > 0) {
      this.onWait(wait);
      await this.sleepImpl(wait);
    }
    this.history.push({ at: this.clock(), weight });
    return wait;
  }
}
