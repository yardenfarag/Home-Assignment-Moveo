/**
 * @module core/db/eventsRepository
 *
 * Writes to the append-only `events` table (ingest runs, scoring, validation
 * failures, retries, guard decisions, errors).
 *
 * Logging an event must never break the main flow, so `recordEvent` does not
 * throw: if the insert fails it prints a formatted error and carries on.
 */
import { BoundaryError, describeUnknownError, formatBoundaryMessage } from "../errors/boundaryError";
import type { Json } from "./database.types";
import { getDb, type Db } from "./client";

/**
 * Parts of the system that produce events. Mirrors the `events.source` check
 * constraint in the migrations — `schemaDrift.test.ts` fails if they drift.
 */
export const EVENT_SOURCES = ["ingest", "scoring", "agent", "api", "guard", "cron", "eval"] as const;

/** Which part of the system produced the event. */
export type EventSource = (typeof EVENT_SOURCES)[number];

/** Event severities. Mirrors the `events.level` check constraint. */
export const EVENT_LEVELS = ["info", "warn", "error"] as const;

/** Severity of an event. */
export type EventLevel = (typeof EVENT_LEVELS)[number];

/** A new event to record. */
export interface NewEvent {
  /** Dotted name, e.g. `ingest.started`, `agent.validation_failed`. */
  eventType: string;
  source: EventSource;
  level?: EventLevel;
  /** Groups events from one ingest run or one chat turn. */
  correlationId?: string;
  hubId?: string;
  sessionId?: string;
  message?: string;
  /** Extra structured details (no secrets). */
  payload?: Record<string, Json>;
}

/** Which events to count. */
export interface EventCountQuery {
  eventType: string;
  /** Only events at or after this time (ISO). */
  since: string;
  /** Only events whose `payload.visitor` equals this key (rate limits, D114). */
  visitor?: string;
}

/**
 * Counts events (uses the `(event_type, created_at)` index).
 * @param query - event type, start time, optional visitor key.
 * @param db - database client (injectable for tests).
 * @returns the number of matching events.
 * @throws BoundaryError (database) when the query fails.
 */
export async function countEvents(query: EventCountQuery, db: Db = getDb()): Promise<number> {
  try {
    let request = db.from("events").select("id", { count: "exact", head: true }).eq("event_type", query.eventType).gte("created_at", query.since);
    if (query.visitor) request = request.eq("payload->>visitor", query.visitor);
    const { count, error } = await request;
    if (error) throw error;
    return count ?? 0;
  } catch (error) {
    throw new BoundaryError({
      name: "EventCountError",
      message: `Could not count '${query.eventType}' events: ${describeUnknownError(error)}`,
      functionName: "countEvents",
      boundary: "database",
      cause: error,
    });
  }
}

/**
 * Records one event. Never throws — failures are printed to the console.
 * @param event - the event to store.
 * @param db - database client (injectable for tests).
 * @returns true if stored, false if the insert failed.
 */
export async function recordEvent(event: NewEvent, db: Db = getDb()): Promise<boolean> {
  try {
    const { error } = await db.from("events").insert({
      event_type: event.eventType,
      source: event.source,
      level: event.level ?? "info",
      correlation_id: event.correlationId ?? null,
      hub_id: event.hubId ?? null,
      session_id: event.sessionId ?? null,
      message: event.message ?? null,
      payload: event.payload ?? {},
    });
    if (error) throw error;
    return true;
  } catch (error) {
    console.error(
      formatBoundaryMessage({
        name: "EventInsertError",
        message: `Could not record event '${event.eventType}': ${error instanceof Error ? error.message : String(error)}`,
        functionName: "recordEvent",
        boundary: "database",
      }),
    );
    return false;
  }
}
