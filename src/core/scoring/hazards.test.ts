import { describe, expect, it } from "vitest";
import { computeHazardScores } from "./hazards";
import type { ObservedSignals } from "./observedSignals";
import type { FemaSignals } from "./types";

/** Observed signals with full coverage; rates are per year. */
function observed(perYear: Partial<ObservedSignals["perYear"]>): ObservedSignals {
  return {
    window: { start: "2021-11-25", end: "2026-11-24" },
    expectedDays: 1826,
    coverage: { snowfall: 1, tempMin: 1, precipitation: 1, windGust: 1, apparentTempMax: 1 },
    perYear: {
      snowDays: 0,
      heavySnowDays: 0,
      extremeColdDays: 0,
      heavyRainDays: 0,
      gustAdvisoryDays: 0,
      gustWarningDays: 0,
      extremeHeatDays: 0,
      ...perYear,
    },
  };
}

const noFema: FemaSignals = {
  countyAreaSqMi: 1000,
  hurricane: null,
  tornado: 0,
  hail: 0,
  inlandFlood: 0,
  coastalFlood: null,
  iceStorm: 0,
  winterWeather: 0,
  coldWave: 0,
  heatWave: 0,
  strongWind: 0,
};

describe("computeHazardScores — combination rules (D49)", () => {
  it("winter takes the WORST facet in each half, then averages the halves", () => {
    // observed: snow 20/40 = 50, cold 24/30 = 80 → max 80
    // FEMA: winter weather 25.079 → 100, cold wave 0, ice 0 → max 100
    // winter = (80 + 100) / 2 = 90
    const scores = computeHazardScores(observed({ snowDays: 20, extremeColdDays: 24 }), {
      ...noFema,
      winterWeather: 25.079,
    });
    expect(scores.winter.observedScore).toBeCloseTo(80);
    expect(scores.winter.femaScore).toBeCloseTo(100);
    expect(scores.winter.score).toBeCloseTo(90);
  });

  it("flood FEMA half takes the worse of inland and coastal", () => {
    // inland 1.768 per 1,000 sq mi = 1.768/4.7 = 37.6, coastal 4.917/4.917 = 100 → 100; rain 2.5/5 = 50 → (50+100)/2 = 75
    const scores = computeHazardScores(observed({ heavyRainDays: 2.5 }), {
      ...noFema,
      inlandFlood: 1.768,
      coastalFlood: 4.917,
    });
    expect(scores.flood.score).toBeCloseTo(75);
  });

  it("severe storms AVERAGES tornado (per area) and hail", () => {
    // tornado 0.987/yr on 1,000 sq mi = 0.987 per 1,000 → 100; hail 4.0845/8.169 = 50 → avg 75
    const scores = computeHazardScores(observed({}), { ...noFema, tornado: 0.987, hail: 4.0845 });
    expect(scores.severeStorms.score).toBeCloseTo(75);
    expect(scores.severeStorms.observedScore).toBeNull();
  });

  it("scores tornado per area: the same count in a 4× bigger county scores 4× lower", () => {
    const small = computeHazardScores(observed({}), { ...noFema, tornado: 0.4, countyAreaSqMi: 500 });
    const big = computeHazardScores(observed({}), { ...noFema, tornado: 0.4, countyAreaSqMi: 2000 });
    const tornadoScore = (s: typeof small) => s.severeStorms.inputs.find((i) => i.signal === "tornadoPer1000SqMi")!.score!;
    expect(tornadoScore(small)).toBeCloseTo(4 * tornadoScore(big));
  });

  it("winter cross-check ignores ice storms, which only FEMA can see (Atlanta-like → High)", () => {
    // observed: snow 0.6/40 = 1.5; FEMA: ice 1.218/1.548 = 78.7 (max), winter weather 2.52/25.079 = 10, cold wave 0.894/10.368 = 8.6
    const scores = computeHazardScores(observed({ snowDays: 0.6 }), {
      ...noFema,
      iceStorm: 1.218,
      winterWeather: 2.52,
      coldWave: 0.894,
    });
    expect(scores.winter.femaScore).toBeCloseTo(78.7, 1); // ice still drives the score
    expect(scores.winter.confidence).toBe("high"); // but not the disagreement check (1.5 vs 10)
  });

  it("winter cross-check still catches real disagreement (Seattle-like → Medium)", () => {
    // observed snow 8/40 = 20; FEMA winter weather 26.87 ≥ 25.079 → 100
    const scores = computeHazardScores(observed({ snowDays: 8 }), { ...noFema, winterWeather: 26.87 });
    expect(scores.winter.confidence).toBe("medium");
  });

  it("inland flood is per 1,000 sq mi with the area floored at the median county (v2, D123)", () => {
    // St. Louis City: 1.29 over 67 sq mi → floored to 645.8 → 1.998 → 42.5 (pure per-area would be 100).
    const tiny = computeHazardScores(observed({ heavyRainDays: 0 }), { ...noFema, countyAreaSqMi: 67, inlandFlood: 1.29 });
    expect(tiny.flood.femaScore).toBeCloseTo(42.5, 1);
    // Maricopa (Phoenix): 8.46 over 9,319 sq mi → 0.908 → 19.3 (v1 capped it at 100).
    const huge = computeHazardScores(observed({ heavyRainDays: 0 }), { ...noFema, countyAreaSqMi: 9319, inlandFlood: 8.46 });
    expect(huge.flood.femaScore).toBeCloseTo(19.3, 1);
    // No county area (0 = unknown) → no inland signal (like tornado).
    const noArea = computeHazardScores(observed({ heavyRainDays: 0 }), { ...noFema, countyAreaSqMi: 0, inlandFlood: 3 });
    expect(noArea.flood.inputs.find((i) => i.signal === "inlandFloodPer1000SqMi")?.value).toBeNull();
  });

  it("flood has no cross-check: heavy rain and flood warnings measure different things", () => {
    // 8.46 per 1,000 sq mi (county 1,000 sq mi) is above the 4.7 anchor → FEMA half 100.
    const scores = computeHazardScores(observed({ heavyRainDays: 0 }), { ...noFema, inlandFlood: 8.46 });
    expect(scores.flood.score).toBe(50); // (0 + 100) / 2
    expect(scores.flood.confidence).toBe("high");
    expect(scores.flood.confidenceReason).toMatch(/different things/);
  });

  it("hurricane is FEMA-only; 'not applicable' (null) scores 0 with High confidence", () => {
    const scores = computeHazardScores(observed({}), noFema);
    expect(scores.hurricane.score).toBe(0);
    expect(scores.hurricane.confidence).toBe("high");
  });
});

describe("computeHazardScores — realistic regression (Minneapolis, hand-calculated)", () => {
  const scores = computeHazardScores(
    observed({ snowDays: 20.8, extremeColdDays: 26, heavyRainDays: 1.2, gustAdvisoryDays: 2, extremeHeatDays: 0.6 }),
    {
      countyAreaSqMi: 613,
      hurricane: null,
      tornado: 0.458,
      hail: 6.412,
      inlandFlood: 1.536,
      coastalFlood: null,
      iceStorm: 0.485,
      winterWeather: 16.58,
      coldWave: 8.947,
      heatWave: 6.684,
      strongWind: 4.566,
    },
  );

  it("flood ≈ 37.3 = (rain 1.2/5 = 24 + inland 1.536 per 645.8 sq mi floor = 2.378/4.7 = 50.6) / 2 (v2, D123)", () => {
    // Hennepin County is 613 sq mi, below the 645.8 sq mi floor, so the floor is used.
    expect(scores.flood.femaScore).toBeCloseTo(50.6, 1);
    expect(scores.flood.score).toBeCloseTo(37.3, 1);
  });

  it("winter ≈ 86.5 = (max(52, 86.7) + max(66.1, 86.3, 31.3)) / 2, High (sources agree)", () => {
    expect(scores.winter.score).toBeCloseTo(86.5, 1);
    expect(scores.winter.confidence).toBe("high");
  });

  it("severe storms ≈ 77.1 = avg(tornado 75.7, hail 78.5)", () => {
    expect(scores.severeStorms.score).toBeCloseTo(77.1, 1);
  });

  it("wind ≈ 46.9 = avg(gusts 20, FEMA 73.8) — Medium because the sources disagree by 53.8", () => {
    expect(scores.wind.score).toBeCloseTo(46.9, 1);
    expect(scores.wind.confidence).toBe("medium");
    expect(scores.wind.confidenceReason).toMatch(/disagree/);
  });

  it("keeps every input so the agent can explain the number", () => {
    const signals = scores.winter.inputs.map((input) => input.signal);
    expect(signals).toEqual(["snowDays", "extremeColdDays", "winterWeather", "coldWave", "iceStorm"]);
  });
});
