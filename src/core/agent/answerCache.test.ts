import { describe, expect, it } from "vitest";
import { answerCacheKey, cacheExpiry, normalizeQuestion, scoresVersionOf } from "./answerCache";
import { snapshot } from "./testFixtures";

describe("answer cache keys (D136)", () => {
  it("normalizes case, spacing, curly quotes and trailing punctuation", () => {
    expect(normalizeQuestion("  Why is   Dallas’s risk HIGH?? ")).toBe("why is dallas's risk high");
    expect(normalizeQuestion("why is dallas's risk high")).toBe("why is dallas's risk high");
  });

  it("gives a different key when the scores, the model or the day change", () => {
    const base = { question: "q", scoresVersion: "v2:run-1", model: "m", today: "2026-11-25" };
    const key = answerCacheKey(base);
    expect(answerCacheKey({ ...base })).toBe(key);
    expect(answerCacheKey({ ...base, scoresVersion: "v2:run-2" })).not.toBe(key);
    expect(answerCacheKey({ ...base, model: "other" })).not.toBe(key);
    expect(answerCacheKey({ ...base, today: "2026-11-26" })).not.toBe(key);
  });

  it("uses the newest run as the scores version, and expires after 24 hours", () => {
    expect(scoresVersionOf([{ ...snapshot, runId: "old", createdAt: "2026-11-24T06:00:00Z" }, { ...snapshot, runId: "new", createdAt: "2026-11-25T06:00:00Z" }])).toMatch(/:new$/);
    expect(cacheExpiry(new Date("2026-11-25T12:00:00Z"))).toBe("2026-11-26T12:00:00.000Z");
  });
});
