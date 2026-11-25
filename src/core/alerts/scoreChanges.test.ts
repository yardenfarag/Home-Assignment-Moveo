import { describe, expect, it } from "vitest";
import { ALERT_EVENT, ALERT_RULES, alertEvent, detectScoreChanges, type HubResult } from "./scoreChanges";

const now = (hubId: string, overallScore: number, riskLevel: HubResult["riskLevel"]): HubResult => ({ hubId, hubName: hubId.toUpperCase(), overallScore, riskLevel });

describe("detectScoreChanges (D124)", () => {
  it("fires on a level change or a move of 10+ points, and stays quiet otherwise", () => {
    const previous = new Map([
      ["level", { hubId: "level", overallScore: 66.4, riskLevel: "medium" as const }],
      ["jump", { hubId: "jump", overallScore: 40, riskLevel: "medium" as const }],
      ["drop", { hubId: "drop", overallScore: 60, riskLevel: "medium" as const }],
      ["quiet", { hubId: "quiet", overallScore: 50, riskLevel: "medium" as const }],
    ]);
    const alerts = detectScoreChanges(previous, [
      now("level", 67.1, "high"), // +0.7 but the level changed
      now("jump", 40 + ALERT_RULES.scoreChangePoints, "medium"), // exactly +10
      now("drop", 50.1, "medium"), // −9.9: no alert
      now("quiet", 52, "medium"),
      now("new-hub", 90, "high"), // no previous result: never alerts
    ]);
    expect(alerts.map((a) => a.hubId)).toEqual(["level", "jump"]);
    expect(alerts[0]).toMatchObject({ fromLevel: "medium", toLevel: "high", change: 0.7, test: false });
    expect(alerts[1]).toMatchObject({ change: 10, fromLevel: "medium", toLevel: "medium" });
  });
});

describe("alertEvent", () => {
  it("stores the alert as an event with a readable message, marking tests clearly", () => {
    const alert = { hubId: "dallas", hubName: "Dallas", fromScore: 64.2, toScore: 72.4, change: 8.2, fromLevel: "medium" as const, toLevel: "high" as const, test: false };
    const event = alertEvent(alert, "run-1");
    expect(event).toMatchObject({ eventType: ALERT_EVENT, source: "scoring", level: "warn", hubId: "dallas", correlationId: "run-1" });
    expect(event.message).toBe("Dallas 64.2 → 72.4 (+8.2), medium → high");
    expect(alertEvent({ ...alert, test: true }, "t").message).toMatch(/^TEST: /);
  });
});
