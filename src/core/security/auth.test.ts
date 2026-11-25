import { describe, expect, it } from "vitest";
import { constantTimeEqual, isCronAuthorized, isSiteAuthorized, parseBasicAuth } from "./auth";

const access = { APP_USERNAME: "analyst", APP_PASSWORD: "correct-horse-battery", CRON_SECRET: "a-very-long-cron-secret-123" };
const basic = (user: string, pass: string) => `Basic ${btoa(`${user}:${pass}`)}`;

describe("parseBasicAuth", () => {
  it("decodes user and password (password may contain ':')", () => {
    expect(parseBasicAuth(basic("analyst", "a:b:c"))).toEqual({ username: "analyst", password: "a:b:c" });
  });

  it("returns null for missing or malformed headers", () => {
    expect(parseBasicAuth(null)).toBeNull();
    expect(parseBasicAuth("Bearer xyz")).toBeNull();
    expect(parseBasicAuth("Basic !!!not-base64")).toBeNull();
    expect(parseBasicAuth(`Basic ${btoa("no-colon")}`)).toBeNull();
  });
});

describe("constantTimeEqual", () => {
  it("compares strings without leaking where they differ", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });
});

describe("isSiteAuthorized", () => {
  it("accepts only the configured username and password", () => {
    expect(isSiteAuthorized(basic("analyst", "correct-horse-battery"), access)).toBe(true);
    expect(isSiteAuthorized(basic("analyst", "wrong"), access)).toBe(false);
    expect(isSiteAuthorized(basic("someone", "correct-horse-battery"), access)).toBe(false);
    expect(isSiteAuthorized(null, access)).toBe(false);
  });
});

describe("isCronAuthorized", () => {
  it("accepts only 'Bearer <CRON_SECRET>'", () => {
    expect(isCronAuthorized("Bearer a-very-long-cron-secret-123", access)).toBe(true);
    expect(isCronAuthorized("Bearer nope", access)).toBe(false);
    expect(isCronAuthorized(basic("analyst", "correct-horse-battery"), access)).toBe(false);
    expect(isCronAuthorized(null, access)).toBe(false);
  });
});
