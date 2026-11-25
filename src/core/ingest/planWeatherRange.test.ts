import { describe, expect, it } from "vitest";
import { planWeatherRange } from "./planWeatherRange";

const policy = { historyStart: "2021-01-01", refetchRecentDays: 7 };

describe("planWeatherRange", () => {
  it("fetches full history for a new hub, up to yesterday", () => {
    expect(planWeatherRange({ ...policy, latestStoredDate: null, today: "2026-11-25" })).toEqual({
      startDate: "2021-01-01",
      endDate: "2026-11-24",
    });
  });

  it("re-fetches the last 7 days when already up to date", () => {
    expect(planWeatherRange({ ...policy, latestStoredDate: "2026-11-24", today: "2026-11-25" })).toEqual({
      startDate: "2026-11-18",
      endDate: "2026-11-24",
    });
  });

  it("covers a gap older than the refetch window", () => {
    expect(planWeatherRange({ ...policy, latestStoredDate: "2026-11-01", today: "2026-11-25" })).toEqual({
      startDate: "2026-11-02",
      endDate: "2026-11-24",
    });
  });

  it("does nothing before history starts", () => {
    expect(planWeatherRange({ ...policy, latestStoredDate: null, today: "2021-01-01" })).toBeNull();
  });

  it("never starts before the history start", () => {
    expect(planWeatherRange({ ...policy, latestStoredDate: "2021-01-02", today: "2021-01-04" })).toEqual({
      startDate: "2021-01-01",
      endDate: "2021-01-03",
    });
  });
});
