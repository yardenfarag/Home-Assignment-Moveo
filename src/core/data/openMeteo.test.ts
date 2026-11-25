import { describe, expect, it, vi } from "vitest";
import { buildArchiveUrl, estimateCallWeight, fetchDailyWeather, parseArchiveResponse } from "./openMeteo";

/** Trimmed copy of a real response (Denver, Nov 2026). */
const realResponse = {
  daily_units: {
    time: "iso8601",
    snowfall_sum: "cm",
    temperature_2m_min: "°C",
    precipitation_sum: "mm",
    wind_gusts_10m_max: "km/h",
    apparent_temperature_max: "°C",
  },
  daily: {
    time: ["2026-11-20", "2026-11-21", "2026-11-22"],
    snowfall_sum: [0, 0.7, null],
    temperature_2m_min: [2.3, -0.6, null],
    precipitation_sum: [0, 1, null],
    wind_gusts_10m_max: [41, 30.6, null],
    apparent_temperature_max: [13.1, 2.7, null],
  },
};

describe("parseArchiveResponse", () => {
  it("maps arrays to days and drops trailing empty days", () => {
    expect(parseArchiveResponse(realResponse)).toEqual([
      { date: "2026-11-20", snowfallCm: 0, tempMinC: 2.3, precipitationMm: 0, windGustMaxKmh: 41, apparentTempMaxC: 13.1 },
      { date: "2026-11-21", snowfallCm: 0.7, tempMinC: -0.6, precipitationMm: 1, windGustMaxKmh: 30.6, apparentTempMaxC: 2.7 },
    ]);
  });

  it("rejects unexpected units (e.g. inches)", () => {
    const inches = { ...realResponse, daily_units: { ...realResponse.daily_units, snowfall_sum: "inch" } };
    expect(() => parseArchiveResponse(inches)).toThrow();
  });

  it("rejects arrays of different lengths", () => {
    const broken = { ...realResponse, daily: { ...realResponse.daily, snowfall_sum: [0] } };
    expect(() => parseArchiveResponse(broken)).toThrow(/expected 3/);
  });
});

describe("estimateCallWeight", () => {
  it("follows Open-Meteo's weighting", () => {
    expect(estimateCallWeight(14, 5)).toBe(1);
    expect(estimateCallWeight(7, 5)).toBe(1);
    expect(estimateCallWeight(28, 5)).toBe(2);
    expect(estimateCallWeight(28, 15)).toBe(3);
  });
});

describe("buildArchiveUrl", () => {
  it("includes the point, range, variables and timezone", () => {
    const url = new URL(
      buildArchiveUrl({ latitude: 39.7, longitude: -105, timezone: "America/Denver", startDate: "2025-01-01", endDate: "2025-12-31" }),
    );
    expect(url.searchParams.get("daily")).toBe(
      "snowfall_sum,temperature_2m_min,precipitation_sum,wind_gusts_10m_max,apparent_temperature_max",
    );
    expect(url.searchParams.get("timezone")).toBe("America/Denver");
    expect(url.searchParams.get("start_date")).toBe("2025-01-01");
  });
});

describe("fetchDailyWeather", () => {
  it("wraps a bad response in an OpenMeteoResponseError", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ nope: true }), { status: 200 }));
    await expect(
      fetchDailyWeather(
        { latitude: 1, longitude: 1, timezone: "UTC", startDate: "2025-01-01", endDate: "2025-01-02" },
        { fetchImpl },
      ),
    ).rejects.toThrow(/OpenMeteoResponseError \|\| .* \|\| fetchDailyWeather \|\| 🐸/);
  });

  it("skips the request for an empty range", async () => {
    const fetchImpl = vi.fn();
    await expect(
      fetchDailyWeather({ latitude: 1, longitude: 1, timezone: "UTC", startDate: "2025-01-02", endDate: "2025-01-01" }, { fetchImpl }),
    ).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
