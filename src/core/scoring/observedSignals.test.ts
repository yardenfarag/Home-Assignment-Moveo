import { describe, expect, it } from "vitest";
import type { DailyWeather } from "../domain/weather";
import { daysInclusive } from "../utils/dates";
import { computeObservedSignals, scoringWindow } from "./observedSignals";

/** A calm day; override fields per test. */
function day(date: string, overrides: Partial<DailyWeather> = {}): DailyWeather {
  return { date, snowfallCm: 0, tempMinC: 5, precipitationMm: 0, windGustMaxKmh: 20, apparentTempMaxC: 15, ...overrides };
}

describe("scoringWindow", () => {
  it("is the last 1,826 days ending at the newest day (5 years incl. one leap day)", () => {
    const window = scoringWindow("2026-11-24");
    expect(window).toEqual({ start: "2021-11-25", end: "2026-11-24" });
    expect(daysInclusive(window.start, window.end)).toBe(1826);
  });
});

describe("computeObservedSignals", () => {
  // 10-day window, 2025-01-01..2025-01-10
  const days: DailyWeather[] = [
    day("2025-01-01", { snowfallCm: 1 }), // snow day (exactly 1 cm counts)
    day("2025-01-02", { snowfallCm: 0.9 }), // not a snow day
    day("2025-01-03", { snowfallCm: 15 }), // snow day + heavy snow day
    day("2025-01-04", { tempMinC: -18 }), // extreme cold (exactly −18 counts)
    day("2025-01-05", { tempMinC: -17.9 }), // not extreme cold
    day("2025-01-06", { precipitationMm: 50 }), // heavy rain (exactly 50 counts)
    day("2025-01-07", { windGustMaxKmh: 72 }), // advisory gust
    day("2025-01-08", { windGustMaxKmh: 93 }), // advisory + warning gust
    day("2025-01-09", { apparentTempMaxC: 40 }), // extreme heat
    day("2025-01-10", { windGustMaxKmh: null }), // gust missing → 9 of 10 days have wind data
    day("2024-12-31", { snowfallCm: 30 }), // OUTSIDE the window → ignored
  ];
  const signals = computeObservedSignals(days, { start: "2025-01-01", end: "2025-01-10" });

  it("counts threshold days and converts them to per-year rates (count × 365.25 ÷ days with data)", () => {
    expect(signals.perYear.snowDays).toBeCloseTo((2 * 365.25) / 10); // 73.05
    expect(signals.perYear.heavySnowDays).toBeCloseTo(365.25 / 10);
    expect(signals.perYear.extremeColdDays).toBeCloseTo(365.25 / 10);
    expect(signals.perYear.heavyRainDays).toBeCloseTo(365.25 / 10);
    expect(signals.perYear.gustAdvisoryDays).toBeCloseTo((2 * 365.25) / 9); // only 9 days had wind data
    expect(signals.perYear.gustWarningDays).toBeCloseTo(365.25 / 9);
    expect(signals.perYear.extremeHeatDays).toBeCloseTo(365.25 / 10);
  });

  it("reports coverage per weather variable", () => {
    expect(signals.expectedDays).toBe(10);
    expect(signals.coverage.windGust).toBeCloseTo(0.9);
    expect(signals.coverage.snowfall).toBe(1);
  });

  it("returns null rates and zero coverage when there is no data", () => {
    const empty = computeObservedSignals([], { start: "2025-01-01", end: "2025-01-10" });
    expect(empty.perYear.snowDays).toBeNull();
    expect(empty.coverage.snowfall).toBe(0);
  });
});
