import { describe, expect, it } from "vitest";
import type { DailyWeather } from "../domain/weather";
import { computeMonthlyCounts, computeWeatherStat, resolvePeriod } from "./weatherStats";

const bounds = { earliest: "2021-01-01", latest: "2026-11-24" };

describe("resolvePeriod", () => {
  it("a full past year is Jan 1 – Dec 31", () => {
    expect(resolvePeriod({ kind: "year", year: 2025 }, bounds)).toEqual({
      start: "2025-01-01",
      end: "2025-12-31",
      label: "calendar year 2025",
      notes: [],
    });
  });

  it("the current year is clipped to the newest data and says so", () => {
    const period = resolvePeriod({ kind: "year", year: 2026 }, bounds);
    expect(period.end).toBe("2026-11-24");
    expect(period.notes[0]).toMatch(/incomplete.*2026-11-24/);
  });

  it("last 12 months = the 365 days ending at the newest data", () => {
    expect(resolvePeriod({ kind: "last12Months" }, bounds)).toMatchObject({ start: "2025-11-25", end: "2026-11-24" });
  });

  it("a month narrows a year", () => {
    expect(resolvePeriod({ kind: "year", year: 2025, month: 2 }, bounds)).toMatchObject({
      start: "2025-02-01",
      end: "2025-02-28",
      label: "February 2025",
    });
  });

  it("refuses periods with no data instead of returning 0%", () => {
    expect(() => resolvePeriod({ kind: "year", year: 2019 }, bounds)).toThrow(/starts 2021-01-01/);
    expect(() => resolvePeriod({ kind: "range", startDate: "2025-05-01", endDate: "2025-04-01" }, bounds)).toThrow(
      /before/,
    );
  });
});

describe("computeWeatherStat", () => {
  const days: DailyWeather[] = [
    { date: "2025-01-01", snowfallCm: 2, tempMinC: -5, precipitationMm: 3, windGustMaxKmh: 30, apparentTempMaxC: 0 },
    { date: "2025-01-02", snowfallCm: 0, tempMinC: -2, precipitationMm: 0, windGustMaxKmh: 20, apparentTempMaxC: 2 },
    { date: "2025-01-03", snowfallCm: 1, tempMinC: -9, precipitationMm: 1, windGustMaxKmh: 25, apparentTempMaxC: -1 },
    { date: "2025-01-04", snowfallCm: null, tempMinC: 0, precipitationMm: 0, windGustMaxKmh: 10, apparentTempMaxC: 4 },
    { date: "2024-12-31", snowfallCm: 9, tempMinC: -5, precipitationMm: 9, windGustMaxKmh: 10, apparentTempMaxC: 0 },
  ];

  it("breaks the count down by calendar month (for the seasonality strip)", () => {
    const winter: DailyWeather[] = [
      { date: "2025-01-15", snowfallCm: 3, tempMinC: -5, precipitationMm: 3, windGustMaxKmh: 30, apparentTempMaxC: 0 },
      { date: "2025-01-16", snowfallCm: 0, tempMinC: -5, precipitationMm: 0, windGustMaxKmh: 30, apparentTempMaxC: 0 },
      { date: "2025-02-01", snowfallCm: 5, tempMinC: -5, precipitationMm: 5, windGustMaxKmh: 30, apparentTempMaxC: 0 },
    ];
    expect(computeMonthlyCounts(winter, "snow_day", { start: "2025-01-01", end: "2025-03-31" })).toEqual([
      { month: "2025-01", label: "Jan 2025", daysMeeting: 1, daysWithData: 2 },
      { month: "2025-02", label: "Feb 2025", daysMeeting: 1, daysWithData: 1 },
      { month: "2025-03", label: "Mar 2025", daysMeeting: 0, daysWithData: 0 },
    ]);
  });

  it("counts metric days in the period and reports % of days with data", () => {
    const stat = computeWeatherStat(days, "snow_day", { start: "2025-01-01", end: "2025-01-04" });
    expect(stat).toMatchObject({
      daysMeeting: 2, // 2 cm and exactly 1 cm
      daysWithData: 3, // Jan 4 has no snowfall value
      daysInPeriod: 4,
      percentOfDays: 66.7,
      coverage: 0.75,
    });
  });
});
