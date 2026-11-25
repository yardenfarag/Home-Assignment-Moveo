import { describe, expect, it } from "vitest";
import { celsiusToFahrenheit, cmToInches, formatDual, kmhToMph, mmToInches } from "./units";

describe("unit conversions (done in code, never by the LLM)", () => {
  it("converts the threshold values exactly", () => {
    expect(cmToInches(15)).toBeCloseTo(5.906, 3);
    expect(mmToInches(50)).toBeCloseTo(1.969, 3);
    expect(celsiusToFahrenheit(-18)).toBeCloseTo(-0.4, 1);
    expect(celsiusToFahrenheit(40)).toBe(104);
    expect(kmhToMph(93)).toBeCloseTo(57.79, 2);
  });
});

describe("formatDual", () => {
  it("leads with the chosen system and puts the other in brackets", () => {
    expect(formatDual({ metric: "15 cm", us: "5.9 in" }, "us")).toBe("5.9 in (15 cm)");
    expect(formatDual({ metric: "15 cm", us: "5.9 in" }, "metric")).toBe("15 cm (5.9 in)");
  });
});
