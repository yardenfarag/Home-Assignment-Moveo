import { describe, expect, it } from "vitest";
import { addDays, daysInclusive, daysOfMonthInPeriod, isoDateInTimeZone, lastDayOfMonth, minDate, monthLabel, toIsoDate } from "./dates";

describe("dates", () => {
  it("adds days across month and leap-year boundaries", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
  });

  it("counts days inclusively", () => {
    expect(daysInclusive("2025-01-01", "2025-01-01")).toBe(1);
    expect(daysInclusive("2025-01-01", "2025-12-31")).toBe(365);
    expect(daysInclusive("2025-01-02", "2025-01-01")).toBe(0);
  });

  it("formats and compares", () => {
    expect(toIsoDate(new Date("2026-11-25T23:59:00Z"))).toBe("2026-11-25");
    expect(minDate("2025-05-01", "2025-04-30")).toBe("2025-04-30");
  });

  it("rejects malformed dates", () => {
    expect(() => addDays("2025-13-01", 1)).toThrow(/Invalid ISO date/);
    expect(() => addDays("25-01-01", 1)).toThrow(/Invalid ISO date/);
  });

  it("rejects impossible calendar dates instead of rolling them over", () => {
    expect(() => addDays("2025-02-30", 0)).toThrow(/Invalid ISO date: 2025-02-30/);
    expect(() => daysInclusive("2025-04-31", "2025-05-01")).toThrow(/Invalid ISO date/);
    expect(() => addDays("2025-02-29", 0)).toThrow(/Invalid ISO date/); // 2025 is not a leap year
    expect(addDays("2024-02-29", 0)).toBe("2024-02-29");
  });

  it("knows each month's last day, short label, and days inside a period", () => {
    expect(lastDayOfMonth(2024, 2)).toBe("2024-02-29");
    expect(lastDayOfMonth(2025, 12)).toBe("2025-12-31");
    expect(monthLabel("2025-01")).toBe("Jan 2025");
    expect(monthLabel("2024-12")).toBe("Dec 2024");
    expect(daysOfMonthInPeriod("2025-02", "2025-01-01", "2025-12-31")).toBe(28);
    expect(daysOfMonthInPeriod("2024-02", "2024-01-01", "2024-12-31")).toBe(29);
    expect(daysOfMonthInPeriod("2025-11", "2024-11-25", "2025-11-24")).toBe(24);
    expect(daysOfMonthInPeriod("2024-11", "2024-11-25", "2025-11-24")).toBe(6);
    expect(daysOfMonthInPeriod("2026-01", "2025-01-01", "2025-12-31")).toBe(0);
  });

  it("gives the local calendar date in a timezone", () => {
    const sixUtc = new Date("2026-11-25T06:00:00Z");
    expect(isoDateInTimeZone(sixUtc, "America/New_York")).toBe("2026-11-25"); // 01:00 local
    expect(isoDateInTimeZone(sixUtc, "America/Denver")).toBe("2026-11-24"); // 23:00 the evening before
    expect(isoDateInTimeZone(sixUtc, "America/Los_Angeles")).toBe("2026-11-24");
    expect(isoDateInTimeZone(sixUtc, "UTC")).toBe("2026-11-25");
  });
});
