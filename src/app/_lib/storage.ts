/**
 * @module app/_lib/storage
 *
 * What this BROWSER remembers (U5b, D60): the unit system, and the ids of its
 * own chats (newest first). Nothing sensitive — the chats live on the server.
 */
import { UNIT_SYSTEMS, type UnitSystem } from "@/core/utils/units";

const UNITS_KEY = "sneakoscope.units";
const SESSIONS_KEY = "sneakoscope.sessions";
/** How many past chats the side nav remembers. */
const MAX_SESSIONS = 50;

/** True when running in a browser with localStorage available. */
const hasStorage = () => typeof window !== "undefined" && !!window.localStorage;

/** @returns the saved unit system (default US). */
export function loadUnits(): UnitSystem {
  if (!hasStorage()) return "us";
  const saved = window.localStorage.getItem(UNITS_KEY);
  return (UNIT_SYSTEMS as readonly string[]).includes(saved ?? "") ? (saved as UnitSystem) : "us";
}

/** @param units - the unit system to remember. */
export function saveUnits(units: UnitSystem): void {
  if (hasStorage()) window.localStorage.setItem(UNITS_KEY, units);
  notify();
}

/** @returns ids of this browser's chats, newest first. */
export function loadSessionIds(): string[] {
  if (!hasStorage()) return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(SESSIONS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Remembers a chat id (moves it to the top).
 * @param id - session id.
 * @returns the updated list.
 */
export function rememberSession(id: string): string[] {
  const ids = [id, ...loadSessionIds().filter((existing) => existing !== id)].slice(0, MAX_SESSIONS);
  if (hasStorage()) window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(ids));
  notify();
  return ids;
}

/** Fired in this tab when we change stored values (the "storage" event only fires in OTHER tabs). */
const CHANGE_EVENT = "sneakoscope-storage";

/** Tells subscribers in this tab that stored values changed. */
function notify(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Subscribes to stored-value changes (this tab and other tabs), for useSyncExternalStore.
 * @param callback - called on every change.
 * @returns the unsubscribe function.
 */
export function subscribeToStorage(callback: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

let cachedRaw: string | null = null;
let cachedIds: string[] = [];

/**
 * Stable snapshot of the session ids (same array until the stored value changes),
 * as useSyncExternalStore requires.
 * @returns ids, newest first.
 */
export function sessionIdsSnapshot(): string[] {
  const raw = typeof window === "undefined" ? null : window.localStorage.getItem(SESSIONS_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedIds = loadSessionIds();
  }
  return cachedIds;
}

/** Server-side snapshot: nothing is remembered on the server. */
export const EMPTY_IDS: string[] = [];

/** Alerts this browser dismissed (D124). There's no login, so a dismissal is per browser, never for everyone. */
const DISMISSED_KEY = "sneakoscope.dismissedAlerts";
/** Older dismissals are dropped first; alerts older than 30 days aren't shown anyway. */
const MAX_DISMISSED = 100;

let cachedDismissedRaw: string | null = null;
let cachedDismissed: string[] = [];

/**
 * Stable snapshot of the dismissed alert ids, for useSyncExternalStore.
 * @returns the ids.
 */
export function dismissedAlertsSnapshot(): string[] {
  const raw = typeof window === "undefined" ? null : window.localStorage.getItem(DISMISSED_KEY);
  if (raw !== cachedDismissedRaw) {
    cachedDismissedRaw = raw;
    try {
      const parsed: unknown = JSON.parse(raw ?? "[]");
      cachedDismissed = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
    } catch {
      cachedDismissed = [];
    }
  }
  return cachedDismissed;
}

/**
 * Remembers that this browser dismissed an alert.
 * @param id - the alert id.
 */
export function dismissAlert(id: string): void {
  const ids = [id, ...dismissedAlertsSnapshot().filter((existing) => existing !== id)].slice(0, MAX_DISMISSED);
  if (hasStorage()) window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids));
  notify();
}
