/**
 * @module core/db/eventsRepository
 *
 * Writes to the append-only `events` table (ingest runs, scoring, validation
 * failures, retries, guard decisions, errors).
 *
 * Logging an event must never break the main flow, so `recordEvent` does not
 * throw: if the insert fails it prints a formatted error and carries on.
 */
import { formatBoundaryMessage } from "../errors/boundaryError";
import type { Json } from "./database.types";
import { getDb, type Db } from "./client";

/** Which part of the system produced the event (matches the DB check constraint). */
export type EventSource = "ingest" | "scoring" | "agent" | "api" | "guard" | "cron" | "eval";

/** Severity of an event. */
export type EventLevel = "info" | "warn" | "error";

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
