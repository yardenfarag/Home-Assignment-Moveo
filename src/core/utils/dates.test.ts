import { describe, expect, it } from "vitest";
import { addDays, daysInclusive, minDate, toIsoDate } from "./dates";

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
});
