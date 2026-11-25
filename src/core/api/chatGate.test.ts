import { describe, expect, it, vi } from "vitest";
import type { EventCountQuery, NewEvent } from "../db/eventsRepository";
import { RATE_LIMITS } from "../security/rateLimit";
import { OPERATOR_HEADER, checkChatGate } from "./chatGate";

const SECRET = "a-very-long-cron-secret-123";

/** Gate deps with fixed counts: burst and daily for the visitor, plus today's total. */
function deps(counts: { burst: number; daily: number; global: number }, failCount = false) {
  const events: NewEvent[] = [];
  return {
    events,
    deps: {
      secret: SECRET,
      now: () => new Date("2026-11-25T12:00:00Z"),
      recordEvent: async (e: NewEvent) => {
        events.push(e);
        return true;
      },
      countEvents: async (q: EventCountQuery) => {
        if (failCount) throw new Error("db down");
        if (!q.visitor) return counts.global;
        return q.since.endsWith("T00:00:00.000Z") ? counts.daily : counts.burst;
      },
    },
  };
}

const visitorHeaders = () => new Headers({ "x-forwarded-for": "203.0.113.7" });

describe("checkChatGate (D114)", () => {
  it("lets a normal request through and records it with a hashed visitor key", async () => {
    const { deps: d, events } = deps({ burst: 3, daily: 10, global: 50 });
    expect(await checkChatGate(visitorHeaders(), d)).toBeNull();
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("chat.request");
    expect(JSON.stringify(events[0])).not.toContain("203.0.113.7");
  });

  it("refuses a burst with a friendly 429, and logs it without recording a request", async () => {
    const { deps: d, events } = deps({ burst: RATE_LIMITS.visitorBurst.max, daily: 20, global: 50 });
    const error = await checkChatGate(visitorHeaders(), d);
    expect(error).toMatchObject({ code: "too_many_requests", status: 429 });
    expect(events.map((e) => e.eventType)).toEqual(["chat.rate_limited"]);
  });

  it("refuses everyone once the shared daily cap is reached", async () => {
    const { deps: d } = deps({ burst: 0, daily: 0, global: RATE_LIMITS.globalDaily.max });
    expect(await checkChatGate(visitorHeaders(), d)).toMatchObject({ code: "daily_limit", status: 429 });
  });

  it("lets the operator (eval script) through with the right key only", async () => {
    const full = { burst: 999, daily: 999, global: 999 };
    expect(await checkChatGate(new Headers({ [OPERATOR_HEADER]: SECRET }), deps(full).deps)).toBeNull();
    expect(await checkChatGate(new Headers({ [OPERATOR_HEADER]: "guess" }), deps(full).deps)).toMatchObject({ code: "daily_limit" });
  });

  it("lets the request through (and logs) when counting fails, instead of locking everyone out", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { deps: d } = deps({ burst: 0, daily: 0, global: 0 }, true);
    expect(await checkChatGate(visitorHeaders(), d)).toBeNull();
    expect(log.mock.calls[0][0]).toMatch(/RateLimitCountError \|\| .* \|\| checkChatGate \|\| 🐘/);
    log.mockRestore();
  });
});
