import { describe, expect, it } from "vitest";
import { linearScore } from "./normalize";

describe("linearScore", () => {
  it("maps 0 → 0 and the anchor → 100, linearly in between", () => {
    expect(linearScore(0, 0.248)).toBe(0);
    expect(linearScore(0.124, 0.248)).toBeCloseTo(50);
    expect(linearScore(0.248, 0.248)).toBe(100);
  });

  it("caps at 100 above the anchor (Miami hurricane 0.305 vs p95 0.248)", () => {
    expect(linearScore(0.305, 0.248)).toBe(100);
  });

  it("throws on impossible inputs instead of hiding them", () => {
    expect(() => linearScore(1, 0)).toThrow(/anchor/);
    expect(() => linearScore(-1, 10)).toThrow(/value/);
    expect(() => linearScore(Number.NaN, 10)).toThrow(/value/);
  });
});
