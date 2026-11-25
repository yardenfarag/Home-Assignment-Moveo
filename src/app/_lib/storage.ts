/**
 * @module app/_lib/storage
 *
 * What this BROWSER remembers (U5b): the ids of its own chats (newest first) and the
 * alerts it dismissed. Nothing sensitive: the chats live on the server. US units only (D126).
 *
 * Every read and write goes through {@link safeGet} / {@link safeSet} (B3): when the browser
 * blocks storage (private mode, a SecurityError, a full quota) the values live in memory for
 * this visit instead, and the app keeps working.
 */
import { REMEMBERED_CHATS_LIMIT } from "@/core/agent/config";

const SESSIONS_KEY = "sneakoscope.sessions";
/** How many past chats the side nav remembers (the sessions API accepts the same number). */
const MAX_SESSIONS = REMEMBERED_CHATS_LIMIT;

/** Alerts this browser dismissed (D124). There's no login, so a dismissal is per browser, never for everyone. */
const DISMISSED_KEY = "sneakoscope.dismissedAlerts";
/** Older dismissals are dropped first; alerts older than 30 days aren't shown anyway. */
const MAX_DISMISSED = 100;

/** Shape of a session id (a UUID). Anything else in storage is ignored (B4). */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True when a value looks like a session id.
 * @param id - any value.
 * @returns whether it's a UUID-shaped string.
 */
export const isSessionId = (id: unknown): id is string => typeof id === "string" && UUID_SHAPE.test(id);

/** Values whose write to localStorage failed: they're kept here for the rest of the visit. */
const memory = new Map<string, string>();

/**
 * The browser's localStorage, or null on the server or when touching it throws.
 * @returns the storage, or null.
 */
function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : (window.localStorage ?? null);
  } catch {
    return null;
  }
}

/**
 * Reads a stored value without ever throwing.
 * @param key - the storage key.
 * @returns the value, or null.
 */
export function safeGet(key: string): string | null {
  if (memory.has(key)) return memory.get(key) ?? null;
  try {
    return browserStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/**
 * Stores a value without ever throwing (falls back to memory for this visit).
 * @param key - the storage key.
 * @param value - the value.
 */
export function safeSet(key: string, value: string): void {
  try {
    const storage = browserStorage();
    if (!storage) throw new Error("no storage");
    storage.setItem(key, value);
    memory.delete(key);
  } catch {
    memory.set(key, value);
  }
}

/**
 * Parses a stored JSON list, keeping only the entries that pass the check.
 * @param raw - the stored text (null when nothing is stored).
 * @param keep - which entries are valid.
 * @returns the valid entries (empty for missing or corrupt values).
 */
function parseIdList(raw: string | null, keep: (value: unknown) => value is string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(keep) : [];
  } catch {
    return [];
  }
}

/** Any string is a valid alert id. */
const isString = (value: unknown): value is string => typeof value === "string";

/**
 * A stored id list with a stable snapshot (same array until the stored text changes), as
 * useSyncExternalStore requires.
 * @param key - the storage key.
 * @param keep - which entries are valid.
 * @returns the snapshot reader.
 */
function idListStore(key: string, keep: (value: unknown) => value is string): () => string[] {
  let cachedRaw: string | null | undefined;
  let cached: string[] = [];
  return () => {
    const raw = safeGet(key);
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cached = parseIdList(raw, keep);
    }
    return cached;
  };
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

/** Server-side snapshot: nothing is remembered on the server. */
export const EMPTY_IDS: string[] = [];

/**
 * Stable snapshot of this browser's chat ids, newest first (only UUID-shaped ones, B4).
 * @returns the ids.
 */
export const sessionIdsSnapshot = idListStore(SESSIONS_KEY, isSessionId);

/** @returns ids of this browser's chats, newest first (only UUID-shaped ones). */
export function loadSessionIds(): string[] {
  return parseIdList(safeGet(SESSIONS_KEY), isSessionId);
}

/**
 * Remembers a chat id (moves it to the top). Ids that aren't UUID-shaped are ignored.
 * @param id - session id.
 * @returns the updated list.
 */
export function rememberSession(id: string): string[] {
  if (!isSessionId(id)) return loadSessionIds();
  const ids = [id, ...loadSessionIds().filter((existing) => existing !== id)].slice(0, MAX_SESSIONS);
  safeSet(SESSIONS_KEY, JSON.stringify(ids));
  notify();
  return ids;
}

/**
 * Stable snapshot of the dismissed alert ids, for useSyncExternalStore.
 * @returns the ids.
 */
export const dismissedAlertsSnapshot = idListStore(DISMISSED_KEY, isString);

/**
 * Remembers that this browser dismissed an alert.
 * @param id - the alert id.
 */
export function dismissAlert(id: string): void {
  const ids = [id, ...dismissedAlertsSnapshot().filter((existing) => existing !== id)].slice(0, MAX_DISMISSED);
  safeSet(DISMISSED_KEY, JSON.stringify(ids));
  notify();
}
