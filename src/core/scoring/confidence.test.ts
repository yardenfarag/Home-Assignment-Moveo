import { describe, expect, it } from "vitest";
import { femaOnlyConfidence, hybridConfidence, weakestConfidence } from "./confidence";

describe("hybridConfidence (observed + FEMA)", () => {
  it("is High when data is complete and the sources agree", () => {
    expect(hybridConfidence({ observedScore: 87, femaScore: 86, coverage: 1 }).confidence).toBe("high");
  });

  it("stays High at exactly 40 points apart (the rule is 'more than 40')", () => {
    expect(hybridConfidence({ observedScore: 60, femaScore: 20, coverage: 1 }).confidence).toBe("high");
  });

  it("is Medium when the sources disagree (Seattle winter: observed 20 vs FEMA 100)", () => {
    const result = hybridConfidence({ observedScore: 20, femaScore: 100, coverage: 1 });
    expect(result.confidence).toBe("medium");
    expect(result.reason).toMatch(/disagree/i);
  });

  it("is Medium when 5–20% of days are missing, Low below 80%", () => {
    expect(hybridConfidence({ observedScore: 50, femaScore: 50, coverage: 0.9 }).confidence).toBe("medium");
    expect(hybridConfidence({ observedScore: 50, femaScore: 50, coverage: 0.7 }).confidence).toBe("low");
  });

  it("compares like with like: uses the comparable FEMA score when given (S9)", () => {
    // Atlanta-like winter: FEMA half is 79 only because of ice storms; comparable FEMA (no ice) is 10
    const result = hybridConfidence({ observedScore: 2, femaScore: 79, comparableFemaScore: 10, coverage: 1 });
    expect(result.confidence).toBe("high");
  });

  it("skips the disagreement check when the halves measure different things (flood)", () => {
    const result = hybridConfidence({ observedScore: 0, femaScore: 100, comparableFemaScore: "not-comparable", coverage: 1 });
    expect(result.confidence).toBe("high");
    expect(result.reason).toMatch(/different things/);
  });

  it("is Low when a source is missing", () => {
    expect(hybridConfidence({ observedScore: null, femaScore: 50, coverage: 1 }).confidence).toBe("low");
    expect(hybridConfidence({ observedScore: 50, femaScore: null, coverage: 1 }).confidence).toBe("low");
  });
});

describe("femaOnlyConfidence", () => {
  it("is High with FEMA's long-record frequency, Low without it", () => {
    expect(femaOnlyConfidence(55).confidence).toBe("high");
    expect(femaOnlyConfidence(null).confidence).toBe("low");
  });
});

describe("weakestConfidence", () => {
  it("returns the lowest level", () => {
    expect(weakestConfidence(["high", "medium", "high"])).toBe("medium");
    expect(weakestConfidence(["high", "low", "medium"])).toBe("low");
    expect(weakestConfidence(["high"])).toBe("high");
  });

  it("throws on an empty list", () => {
    expect(() => weakestConfidence([])).toThrow();
  });
});
