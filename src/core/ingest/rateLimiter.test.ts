import { describe, expect, it } from "vitest";
import { computeWaitMs, WeightedRateLimiter } from "./rateLimiter";

const limits = { perMinute: 100, perHour: 300, perDay: 1_000 };
const MIN = 60_000;

describe("computeWaitMs", () => {
  it("goes immediately when there is room", () => {
    expect(computeWaitMs([], 0, 50, limits)).toBe(0);
    expect(computeWaitMs([{ at: 0, weight: 40 }], 1_000, 50, limits)).toBe(0);
  });

  it("waits for the minute window when it is full", () => {
    // 90 used at t=0; asking for 20 at t=10s → wait until t=60s (oldest expires).
    expect(computeWaitMs([{ at: 0, weight: 90 }], 10_000, 20, limits)).toBe(50_000);
  });

  it("waits for the hour window even when the minute window is free", () => {
    const history = [
      { at: 0, weight: 100 },
      { at: 2 * MIN, weight: 100 },
      { at: 4 * MIN, weight: 100 },
    ];
    // at 10 min, hour window holds 300; need the first call (t=0) to expire at 60 min.
    expect(computeWaitMs(history, 10 * MIN, 50, limits)).toBe(50 * MIN);
  });

  it("only drops as many old calls as needed", () => {
    const history = [
      { at: 0, weight: 50 },
      { at: 20_000, weight: 50 },
    ];
    // need 30 more within minute: dropping the t=0 call is enough → wait till 60s.
    expect(computeWaitMs(history, 30_000, 30, limits)).toBe(30_000);
  });

  it("refuses a request heavier than a whole window", () => {
    expect(() => computeWaitMs([], 0, 150, limits)).toThrow("Request weight 150 exceeds the per-minute limit of 100");
  });

  it("names the daily window in plain words", () => {
    expect(() => computeWaitMs([], 0, 1_500, { perMinute: 2_000, perHour: 2_000, perDay: 1_000 })).toThrow("exceeds the daily limit of 1000");
  });
});

describe("WeightedRateLimiter", () => {
  it("sleeps when needed and records each call", async () => {
    let now = 0;
    const sleeps: number[] = [];
    const limiter = new WeightedRateLimiter(
      limits,
      () => now,
      async (ms) => {
        sleeps.push(ms);
        now += ms;
      },
    );
    await limiter.acquire(80);
    await limiter.acquire(80); // minute window would hold 160 > 100 → wait 60s
    expect(sleeps).toEqual([MIN]);
  });
});
