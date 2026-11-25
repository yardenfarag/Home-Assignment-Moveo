import { describe, expect, it } from "vitest";
import { RATE_LIMITS, clientIp, decideRateLimit, visitorKey } from "./rateLimit";

const under = { visitorBurst: 0, visitorDaily: 0, globalDaily: 0 };

describe("decideRateLimit", () => {
  it("allows requests below every limit", () => {
    expect(decideRateLimit(under)).toEqual({ allowed: true });
    expect(
      decideRateLimit({
        visitorBurst: RATE_LIMITS.visitorBurst.max - 1,
        visitorDaily: RATE_LIMITS.visitorDaily.max - 1,
        globalDaily: RATE_LIMITS.globalDaily.max - 1,
      }),
    ).toEqual({ allowed: true });
  });

  it("refuses at each limit, the shared daily cap first", () => {
    expect(decideRateLimit({ ...under, visitorBurst: RATE_LIMITS.visitorBurst.max })).toEqual({ allowed: false, limit: "visitorBurst" });
    expect(decideRateLimit({ ...under, visitorDaily: RATE_LIMITS.visitorDaily.max })).toEqual({ allowed: false, limit: "visitorDaily" });
    expect(decideRateLimit({ visitorBurst: 999, visitorDaily: 999, globalDaily: RATE_LIMITS.globalDaily.max })).toEqual({
      allowed: false,
      limit: "globalDaily",
    });
  });
});

describe("visitorKey", () => {
  it("is stable within a day, changes across days and IPs, and never contains the IP", () => {
    const a = visitorKey("203.0.113.7", "2026-11-25", "secret-secret-secret");
    expect(a).toBe(visitorKey("203.0.113.7", "2026-11-25", "secret-secret-secret"));
    expect(a).not.toBe(visitorKey("203.0.113.7", "2026-11-26", "secret-secret-secret"));
    expect(a).not.toBe(visitorKey("203.0.113.8", "2026-11-25", "secret-secret-secret"));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toContain("203");
  });
});

describe("clientIp", () => {
  it("takes the first x-forwarded-for address, then x-real-ip, else 'unknown'", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
