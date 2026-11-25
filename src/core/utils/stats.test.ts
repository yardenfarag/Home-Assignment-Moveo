import { describe, expect, it } from "vitest";
import { percentile, round } from "./stats";

describe("percentile", () => {
  it("matches the type-7 definition", () => {
    // sorted [1,2,3,4,5]: p95 index = 4*0.95 = 3.8 → 4 + 0.8*(5-4) = 4.8
    expect(percentile([5, 1, 4, 2, 3], 0.95)).toBeCloseTo(4.8);
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([7], 0.95)).toBe(7);
  });

  it("does not mutate the input", () => {
    const values = [3, 1, 2];
    percentile(values, 0.5);
    expect(values).toEqual([3, 1, 2]);
  });

  it("rejects bad input", () => {
    expect(() => percentile([], 0.5)).toThrow(/empty/);
    expect(() => percentile([1], 1.5)).toThrow(/0..1/);
  });
});

describe("round", () => {
  it("rounds to decimals", () => {
    expect(round(0.1 + 0.2, 2)).toBe(0.3);
    expect(round(8.16999, 2)).toBe(8.17);
  });
});
