import { describe, expect, it } from "vitest";
import { HAZARD_WEIGHTS } from "./config";
import { computeOverall, riskLevelFor } from "./overall";
import type { Hazard } from "./types";

const zeros: Record<Hazard, number> = { hurricane: 0, winter: 0, flood: 0, severeStorms: 0, wind: 0, heat: 0 };

describe("HAZARD_WEIGHTS", () => {
  it("sum to 1", () => {
    expect(Object.values(HAZARD_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });
});

describe("computeOverall = 60% weighted average + 40% worst hazard", () => {
  it("one severe hazard is not averaged away (hurricane 100, rest 0 → 0.6×25 + 0.4×100 = 55)", () => {
    const result = computeOverall({ ...zeros, hurricane: 100 });
    expect(result.weightedAverage).toBeCloseTo(25);
    expect(result.overallScore).toBeCloseTo(55);
    expect(result.topHazard).toBe("hurricane");
  });

  it("all hazards at 50 → 50", () => {
    const result = computeOverall({ hurricane: 50, winter: 50, flood: 50, severeStorms: 50, wind: 50, heat: 50 });
    expect(result.overallScore).toBeCloseTo(50);
  });

  it("breaks ties by weight order (winter before flood)", () => {
    expect(computeOverall({ ...zeros, winter: 80, flood: 80 }).topHazard).toBe("winter");
  });
});

describe("riskLevelFor (score rounded: Low 0–33, Medium 34–66, High 67–100)", () => {
  it("applies the cut-offs on the rounded score", () => {
    expect(riskLevelFor(0)).toBe("low");
    expect(riskLevelFor(33.4)).toBe("low");
    expect(riskLevelFor(33.5)).toBe("medium");
    expect(riskLevelFor(66.4)).toBe("medium");
    expect(riskLevelFor(66.5)).toBe("high");
    expect(riskLevelFor(100)).toBe("high");
  });
});
