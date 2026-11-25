import { describe, expect, it } from "vitest";
import { constantTimeEqual, isCronAuthorized } from "./auth";

const env = { CRON_SECRET: "a-very-long-cron-secret-123" };

describe("constantTimeEqual", () => {
  it("compares strings exactly", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });
});

describe("isCronAuthorized", () => {
  it("accepts only the exact Bearer secret Vercel Cron sends", () => {
    expect(isCronAuthorized("Bearer a-very-long-cron-secret-123", env)).toBe(true);
    expect(isCronAuthorized("Bearer nope", env)).toBe(false);
    expect(isCronAuthorized("a-very-long-cron-secret-123", env)).toBe(false);
    expect(isCronAuthorized(null, env)).toBe(false);
  });
});
