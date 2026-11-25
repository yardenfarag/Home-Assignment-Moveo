import { describe, expect, it } from "vitest";
import { relativeTime, whyLevelQuestion, withoutEllipsis } from "./labels";

describe("relativeTime", () => {
  const now = new Date("2026-11-25T12:00:00Z");

  it("says how long ago, in short words", () => {
    expect(relativeTime("2026-11-25T11:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-11-25T11:45:00Z", now)).toBe("15 min ago");
    expect(relativeTime("2026-11-25T09:00:00Z", now)).toBe("3 h ago");
    expect(relativeTime("2026-11-20T12:00:00Z", now)).toMatch(/^Nov (19|20|21)$/); // the local date
  });

  it("returns a dash, not 'Invalid Date', for a timestamp it can't read (N7)", () => {
    expect(relativeTime("not a date", now)).toBe("—");
    expect(relativeTime("", now)).toBe("—");
  });
});

describe("question and label helpers", () => {
  it("builds the 'why is X's risk Y' question in one place", () => {
    expect(whyLevelQuestion("Dallas, TX", "high")).toBe("Why is Dallas, TX's weather risk high?");
  });

  it("drops only a trailing ellipsis", () => {
    expect(withoutEllipsis("Ranking hubs…")).toBe("Ranking hubs");
    expect(withoutEllipsis("Done")).toBe("Done");
  });
});
