import { describe, expect, it } from "vitest";
import { hazardCaveats, metricCaveats, WEATHER_DATA_CAVEAT } from "./caveats";
import { DAY_METRICS } from "./dayMetrics";
import { HAZARDS } from "./types";

describe("caveats", () => {
  it("every hazard has at least one standing caveat", () => {
    for (const hazard of HAZARDS) expect(hazardCaveats(hazard, "us").length).toBeGreaterThan(0);
  });

  it("builds thresholds from config in the chosen unit system", () => {
    expect(hazardCaveats("wind", "us")[0]).toContain("gusts ≥ 58 mph (gusts ≥ 93 km/h)");
    expect(hazardCaveats("wind", "metric")[0]).toContain("gusts ≥ 93 km/h (gusts ≥ 58 mph)");
  });

  it("weather stats always carry the reanalysis caveat, and unscored metrics explain why they're unscored", () => {
    expect(metricCaveats("snow_day", "us")).toEqual([WEATHER_DATA_CAVEAT]);
    expect(metricCaveats("heavy_snow_day", "us")[1]).toMatch(/undercounts.*not used in the risk score/);
    expect(metricCaveats("measurable_snow_day", "us")[1]).toMatch(/winter score counts snow days of ≥ 0.4 in/);
  });

  it("measurable snow follows the NWS 0.1 in bar (G13)", () => {
    expect(DAY_METRICS.measurable_snow_day.threshold).toEqual({ metric: "≥ 0.25 cm of snow", us: "≥ 0.1 in of snow" });
    expect(DAY_METRICS.measurable_snow_day.meets(0.254)).toBe(true);
    expect(DAY_METRICS.measurable_snow_day.meets(0.25)).toBe(false); // a model "trace" value just below 0.1 in
  });
});
