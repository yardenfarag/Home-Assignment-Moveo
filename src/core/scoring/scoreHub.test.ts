import { describe, expect, it } from "vitest";
import { SCORING_VERSION } from "./config";
import type { ObservedSignals } from "./observedSignals";
import { scoreHub } from "./scoreHub";
import type { FemaSignals } from "./types";

const calmObserved: ObservedSignals = {
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
  },
};

const hurricaneCoast: FemaSignals = {
  countyAreaSqMi: 1000,
  hurricane: 0.305, // above p95 → 100
  tornado: 0,
  hail: 0,
  inlandFlood: 0,
  coastalFlood: null,
  iceStorm: null,
  winterWeather: 0,
  coldWave: 0,
  heatWave: 0,
  strongWind: 0,
};

describe("scoreHub", () => {
  it("combines hazards into an overall score, level and top hazard", () => {
    const result = scoreHub(calmObserved, hurricaneCoast);
    expect(result.hazards.hurricane.score).toBe(100);
    expect(result.overallScore).toBe(55); // 0.6 × 25 + 0.4 × 100
    expect(result.riskLevel).toBe("medium");
    expect(result.topHazard).toBe("hurricane");
    expect(result.scoringVersion).toBe(SCORING_VERSION);
  });

  it("hub confidence = weakest hazard confidence", () => {
    // Observed says a lot of heat (60/yr → 100), FEMA says none (0) → disagree → heat Medium
    const result = scoreHub(
      { ...calmObserved, perYear: { ...calmObserved.perYear, extremeHeatDays: 60 } },
      hurricaneCoast,
    );
    expect(result.hazards.heat.confidence).toBe("medium");
    expect(result.confidence).toBe("medium");
  });

  it("without any FEMA record every mixed hazard is Low confidence (a source is missing)", () => {
    const result = scoreHub(calmObserved, null);
    expect(result.hazards.winter.confidence).toBe("low");
    expect(result.confidence).toBe("low");
  });

  it("rounds every published score to 1 decimal", () => {
    const result = scoreHub(
      { ...calmObserved, perYear: { ...calmObserved.perYear, snowDays: 13.37 } },
      hurricaneCoast,
    );
    for (const hazard of Object.values(result.hazards)) {
      expect(hazard.score).toBe(Math.round(hazard.score * 10) / 10);
    }
  });
});
