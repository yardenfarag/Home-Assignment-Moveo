import { describe, expect, it, vi } from "vitest";
import type { StoredEvent } from "../db/eventsRepository";
import type { StoredSnapshot } from "../db/scoresRepository";
import { loadRecentAlerts, testAlertEvent } from "./recentAlerts";
import { ALERT_RULES } from "./scoreChanges";

const alertPayload = { hubId: "dallas", hubName: "Dallas", fromScore: 64.2, toScore: 72.4, change: 8.2, fromLevel: "medium", toLevel: "high", test: false };
const event = (id: string, payload: unknown): StoredEvent => ({ id, eventType: "alert.score_changed", correlationId: null, hubId: "dallas", message: "…", payload: payload as never, createdAt: "2026-11-25T06:05:00Z" });

describe("loadRecentAlerts", () => {
  it("reads the last 30 days of alerts and skips malformed rows", async () => {
    const listEvents = vi.fn(async () => [event("7", alertPayload), event("8", { hubId: "broken" })]);
    const alerts = await loadRecentAlerts({ listEvents, now: () => new Date("2026-11-25T12:00:00Z") });
    expect(alerts).toEqual([{ ...alertPayload, id: "7", createdAt: "2026-11-25T06:05:00Z" }]);
    expect(listEvents).toHaveBeenCalledWith({ eventType: "alert.score_changed", since: "2026-10-26T12:00:00.000Z", limit: ALERT_RULES.showLimit });
  });
});

describe("testAlertEvent", () => {
  it("uses the top hub's real score, shows a +10 move, and is marked as a test", () => {
    const snapshots = [
      { hubId: "dallas", overallScore: 72.4, riskLevel: "high" },
      { hubId: "new-orleans", overallScore: 74.6, riskLevel: "high" },
    ] as unknown as StoredSnapshot[];
    const e = testAlertEvent(snapshots, (id) => (id === "new-orleans" ? "New Orleans" : id));
    expect(e?.payload).toMatchObject({ hubId: "new-orleans", hubName: "New Orleans", fromScore: 64.6, toScore: 74.6, change: 10, fromLevel: "medium", toLevel: "high", test: true });
    expect(e?.message).toMatch(/^TEST: New Orleans/);
    expect(testAlertEvent([], (id) => id)).toBeNull();
  });
});
