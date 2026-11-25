/**
 * @module core/api/evalGate
 *
 * Limits for running the evals from the app (Step 16, D130). The site is public and a run costs
 * money (about $0.20) and minutes, so: at most one run every 30 minutes and 4 per UTC day, for
 * everyone together, and never two at once. Counted from `eval.ui_started` events (no new table);
 * a run counts as in progress until its `eval.finished` event (same correlation id) appears.
 * Pure decision logic plus the counting; the route does the rest.
 */
import type { StoredEvent } from "../db/eventsRepository";

/** The limits: the single source of truth. */
export const EVAL_RUN_LIMITS = {
  minutesBetweenRuns: 30,
  runsPerDay: 4,
  /** A start without a finish older than this is treated as abandoned (a run takes ~1–3 min). */
  runningWindowMinutes: 10,
} as const;

/** Event recorded when a run starts from the app. */
export const EVAL_UI_STARTED = "eval.ui_started";

/** Event recorded when any run finishes (app or CLI). */
export const EVAL_FINISHED = "eval.finished";

/** Whether a run may start now, and if not, why and when. */
export interface EvalGateStatus {
  allowed: boolean;
  reason: "running" | "too_soon" | "daily_limit" | null;
  /** When the next run can start (ISO), or null when it can start now (or a run is in progress). */
  nextAvailableAt: string | null;
  runsLeftToday: number;
  running: boolean;
}

/**
 * Decides from today's starts and the recent finishes.
 * @param starts - today's `eval.ui_started` events, newest first.
 * @param finishes - `eval.finished` events of the last few minutes.
 * @param now - the current time.
 * @returns the status.
 */
export function decideEvalGate(starts: readonly StoredEvent[], finishes: readonly StoredEvent[], now: Date): EvalGateStatus {
  const minutesAgo = (iso: string) => (now.getTime() - new Date(iso).getTime()) / 60_000;
  const finished = new Set(finishes.map((f) => f.correlationId));
  const running = starts.some((s) => minutesAgo(s.createdAt) < EVAL_RUN_LIMITS.runningWindowMinutes && !finished.has(s.correlationId));
  const runsLeftToday = Math.max(0, EVAL_RUN_LIMITS.runsPerDay - starts.length);
  if (running) return { allowed: false, reason: "running", nextAvailableAt: null, runsLeftToday, running };
  if (runsLeftToday === 0) {
    const tomorrow = new Date(now);
    tomorrow.setUTCHours(24, 0, 0, 0);
    return { allowed: false, reason: "daily_limit", nextAvailableAt: tomorrow.toISOString(), runsLeftToday, running };
  }
  const last = starts[0];
  if (last && minutesAgo(last.createdAt) < EVAL_RUN_LIMITS.minutesBetweenRuns) {
    const next = new Date(new Date(last.createdAt).getTime() + EVAL_RUN_LIMITS.minutesBetweenRuns * 60_000);
    return { allowed: false, reason: "too_soon", nextAvailableAt: next.toISOString(), runsLeftToday, running };
  }
  return { allowed: true, reason: null, nextAvailableAt: null, runsLeftToday, running };
}

/**
 * After recording its own start, a run checks it is the only one in progress (two clicks at the
 * same moment can both pass the gate). The earliest start wins; ties go to the smaller id.
 * @param starts - today's `eval.ui_started` events (including this run's).
 * @param finishes - recent `eval.finished` events.
 * @param runId - this run's correlation id.
 * @param now - the current time.
 * @returns true when this run should go ahead.
 */
export function wonRunSlot(starts: readonly StoredEvent[], finishes: readonly StoredEvent[], runId: string, now: Date): boolean {
  const finished = new Set(finishes.map((f) => f.correlationId));
  const windowMs = EVAL_RUN_LIMITS.runningWindowMinutes * 60_000;
  const running = starts
    .filter((s) => s.correlationId === runId || (now.getTime() - new Date(s.createdAt).getTime() < windowMs && !finished.has(s.correlationId)))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || String(a.correlationId).localeCompare(String(b.correlationId)));
  return running[0]?.correlationId === runId;
}

/** What the gate reads (injectable for tests). */
export interface EvalGateDeps {
  listEvents: (query: { eventType: string; since: string; limit: number }) => Promise<StoredEvent[]>;
  now: () => Date;
}

/**
 * Reads today's starts and recent finishes, then decides.
 * @param deps - event reader and clock.
 * @returns the status.
 */
export async function evalGateStatus(deps: EvalGateDeps): Promise<EvalGateStatus> {
  const now = deps.now();
  const { starts, finishes } = await readRunEvents(deps, now);
  return decideEvalGate(starts, finishes, now);
}

/**
 * Reads today's starts and the recent finishes.
 * @param deps - event reader.
 * @param now - the current time.
 * @returns both lists, newest first.
 */
export async function readRunEvents(deps: Pick<EvalGateDeps, "listEvents">, now: Date): Promise<{ starts: StoredEvent[]; finishes: StoredEvent[] }> {
  const startOfDay = `${now.toISOString().slice(0, 10)}T00:00:00.000Z`;
  const recent = new Date(now.getTime() - EVAL_RUN_LIMITS.runningWindowMinutes * 60_000).toISOString();
  const [starts, finishes] = await Promise.all([
    deps.listEvents({ eventType: EVAL_UI_STARTED, since: startOfDay, limit: 20 }),
    deps.listEvents({ eventType: EVAL_FINISHED, since: recent, limit: 20 }),
  ]);
  return { starts, finishes };
}
