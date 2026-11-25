import { describe, expect, it } from "vitest";
import type { StoredEvent } from "../db/eventsRepository";
import { EVAL_RUN_LIMITS, decideEvalGate, wonRunSlot } from "./evalGate";

const now = new Date("2026-11-25T18:00:00Z");
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
const event = (correlationId: string, createdAt: string): StoredEvent => ({ id: correlationId, eventType: "x", correlationId, hubId: null, message: null, payload: {}, createdAt });

describe("decideEvalGate (D130)", () => {
  it("allows a run when nothing ran recently", () => {
    expect(decideEvalGate([], [], now)).toEqual({ allowed: true, reason: null, nextAvailableAt: null, runsLeftToday: EVAL_RUN_LIMITS.runsPerDay, running: false });
    expect(decideEvalGate([event("a", ago(45))], [event("a", ago(43))], now)).toMatchObject({ allowed: true, runsLeftToday: 3 });
  });

  it("refuses while a run is in progress (started, not finished, recent)", () => {
    expect(decideEvalGate([event("a", ago(2))], [], now)).toMatchObject({ allowed: false, reason: "running", running: true });
  });

  it("treats an old start without a finish as abandoned, not running", () => {
    expect(decideEvalGate([event("a", ago(40))], [], now)).toMatchObject({ running: false, allowed: true });
  });

  it("refuses within 30 minutes of the last run, saying when the next one is possible", () => {
    const status = decideEvalGate([event("a", ago(12))], [event("a", ago(10))], now);
    expect(status).toMatchObject({ allowed: false, reason: "too_soon", nextAvailableAt: "2026-11-25T18:18:00.000Z" });
  });

  it("refuses after 4 runs today, until midnight UTC", () => {
    const starts = [event("d", ago(40)), event("c", ago(100)), event("b", ago(200)), event("a", ago(300))];
    const finishes = starts.map((s) => event(s.correlationId!, s.createdAt));
    expect(decideEvalGate(starts, finishes, now)).toMatchObject({ allowed: false, reason: "daily_limit", runsLeftToday: 0, nextAvailableAt: "2026-11-26T00:00:00.000Z" });
  });
});

describe("wonRunSlot (two clicks at once)", () => {
  it("lets only the earliest of two simultaneous runs go ahead", () => {
    const starts = [event("b", ago(0)), event("a", ago(0.01))];
    expect(wonRunSlot(starts, [], "a", now)).toBe(true);
    expect(wonRunSlot(starts, [], "b", now)).toBe(false);
  });

  it("ignores earlier runs that already finished or were abandoned", () => {
    const starts = [event("c", ago(0)), event("b", ago(5)), event("a", ago(40))];
    expect(wonRunSlot(starts, [event("b", ago(2))], "c", now)).toBe(true);
  });
});

describe("decideEvalGate edge cases", () => {
  it("still counts a run started just before midnight UTC as running / too soon", () => {
    const justAfterMidnight = new Date("2026-11-26T00:05:00Z");
    const start = event("late", "2026-11-25T23:58:00.000Z");
    expect(decideEvalGate([start], [], justAfterMidnight)).toMatchObject({ reason: "running", runsLeftToday: EVAL_RUN_LIMITS.runsPerDay });
    expect(decideEvalGate([start], [event("late", "2026-11-25T23:59:30.000Z")], justAfterMidnight)).toMatchObject({ reason: "too_soon" });
  });

  it("doesn't count a run that lost a two-click race against the day's runs", () => {
    const skipped = { ...event("lost", ago(100)), payload: { summary: null, skipped: true } };
    const status = decideEvalGate([event("lost", ago(100))], [skipped], now);
    expect(status).toMatchObject({ allowed: true, runsLeftToday: EVAL_RUN_LIMITS.runsPerDay });
  });
});
