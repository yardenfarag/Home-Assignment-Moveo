import { describe, expect, it } from "vitest";
import type { MonthlyCount } from "@/core/stats/weatherStats";
import { describeStrip, stripMonths } from "./seasonality";

/** A month as tools return it now: `daysWithData` only when some days lack data, no label. */
const month = (key: string, daysMeeting: number, daysWithData?: number): MonthlyCount =>
  daysWithData === undefined ? { month: key, daysMeeting } : { month: key, daysMeeting, daysWithData };

/** A month as OLDER saved answers store it: label and daysWithData always present. */
const savedMonth = (key: string, label: string, daysMeeting: number, daysWithData: number) =>
  ({ month: key, label, daysMeeting, daysWithData }) as MonthlyCount;

describe("stripMonths (S6: no data never looks like zero days)", () => {
  const period = { start: "2025-01-01", end: "2025-03-31" };

  it("marks months with no data and with some days missing", () => {
    const months = stripMonths([month("2025-01", 3), month("2025-02", 0, 0), month("2025-03", 1, 20)], period);
    expect(months.map((m) => m.coverage)).toEqual(["full", "none", "partial"]);
    expect(months.map((m) => m.daysWithData)).toEqual([31, 0, 20]); // a complete month gets its day count back
    expect(months[2].daysInPeriod).toBe(31);
    expect(months.map((m) => m.label)).toEqual(["Jan 2025", "Feb 2025", "Mar 2025"]);
  });

  it("draws older saved entries (label and daysWithData always present) the same way", () => {
    const saved = stripMonths([savedMonth("2025-01", "Jan 2025", 3, 31), savedMonth("2025-02", "Feb 2025", 0, 0), savedMonth("2025-03", "Mar 2025", 1, 20)], period);
    const compact = stripMonths([month("2025-01", 3), month("2025-02", 0, 0), month("2025-03", 1, 20)], period);
    expect(saved).toEqual(compact);
  });

  it("uses one-letter labels for a single year, no year labels", () => {
    const months = stripMonths([month("2025-01", 0), month("2025-02", 0), month("2025-03", 0)], period);
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
    const months = stripMonths([month("2025-01", 3), month("2025-02", 0, 0), month("2025-03", 5)], { start: "2025-01-01", end: "2025-03-31" });
    const text = describeStrip(months, "heavy-rain days");
    expect(text).toContain("Heavy-rain days per month, Jan 2025 to Mar 2025.");
    expect(text).toContain("Most in Mar 2025: 5.");
    expect(text).toContain("1 month without weather data.");
    expect(text).toContain("Feb 2025: no data");
  });
});
