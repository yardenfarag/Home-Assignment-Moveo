import { describe, expect, it } from "vitest";
import type { MonthlyCount } from "@/core/stats/weatherStats";
import { daysOfMonthInPeriod, describeStrip, stripMonths } from "./seasonality";

/** Months from `YYYY-MM` keys, with "Mon YYYY" labels like the tool's. */
const month = (key: string, daysMeeting: number, daysWithData: number): MonthlyCount => {
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return { month: key, label: `${names[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`, daysMeeting, daysWithData };
};

describe("daysOfMonthInPeriod", () => {
  it("counts the month's days inside the period", () => {
    expect(daysOfMonthInPeriod("2025-02", "2025-01-01", "2025-12-31")).toBe(28);
    expect(daysOfMonthInPeriod("2024-02", "2024-01-01", "2024-12-31")).toBe(29);
    expect(daysOfMonthInPeriod("2025-11", "2024-11-25", "2025-11-24")).toBe(24);
    expect(daysOfMonthInPeriod("2024-11", "2024-11-25", "2025-11-24")).toBe(6);
    expect(daysOfMonthInPeriod("2026-01", "2025-01-01", "2025-12-31")).toBe(0);
  });
});

describe("stripMonths (S6: no data never looks like zero days)", () => {
  const period = { start: "2025-01-01", end: "2025-03-31" };

  it("marks months with no data and with some days missing", () => {
    const months = stripMonths([month("2025-01", 3, 31), month("2025-02", 0, 0), month("2025-03", 1, 20)], period);
    expect(months.map((m) => m.coverage)).toEqual(["full", "none", "partial"]);
    expect(months[2].daysInPeriod).toBe(31);
  });

  it("uses one-letter labels for a single year, no year labels", () => {
    const months = stripMonths([month("2025-01", 0, 31), month("2025-02", 0, 28), month("2025-03", 0, 31)], period);
    expect(months.map((m) => m.monthLabel)).toEqual(["J", "F", "M"]);
    expect(months.every((m) => m.yearLabel === "")).toBe(true);
  });

  it("thins labels on long ranges and adds the year at each January", () => {
    const keys = Array.from({ length: 36 }, (_, i) => `${2023 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`);
    const months = stripMonths(
      keys.map((key) => month(key, 1, 28)),
      { start: "2023-01-01", end: "2025-12-31" },
    );
    expect(months.filter((m) => m.monthLabel).length).toBe(12);
    expect(months.filter((m) => m.yearLabel).map((m) => m.yearLabel)).toEqual(["'23", "'24", "'25"]);
  });
});

describe("describeStrip", () => {
  it("names the peak month and the months without data", () => {
    const months = stripMonths([month("2025-01", 3, 31), month("2025-02", 0, 0), month("2025-03", 5, 31)], { start: "2025-01-01", end: "2025-03-31" });
    const text = describeStrip(months, "heavy-rain days");
    expect(text).toContain("Heavy-rain days per month, Jan 2025 to Mar 2025.");
    expect(text).toContain("Most in Mar 2025: 5.");
    expect(text).toContain("1 month without weather data.");
    expect(text).toContain("Feb 2025: no data");
  });
});
