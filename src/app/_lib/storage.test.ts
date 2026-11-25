import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

/** A tiny in-memory localStorage; `fail` makes reads and/or writes throw like a blocked or full browser store. */
function fakeStorage(initial: Record<string, string> = {}, fail: { read?: boolean; write?: boolean } = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => {
      if (fail.read) throw new DOMException("denied", "SecurityError");
      return data.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (fail.write) throw new DOMException("full", "QuotaExceededError");
      data.set(key, value);
    },
  };
}

/** Installs a fake `window` (with the given storage, or one whose `localStorage` getter throws) and loads a fresh module. */
async function loadWith(storage: ReturnType<typeof fakeStorage> | "throws") {
  vi.resetModules();
  const events = new EventTarget();
  vi.stubGlobal("window", {
    get localStorage() {
      if (storage === "throws") throw new DOMException("denied", "SecurityError");
      return storage;
    },
    dispatchEvent: (event: Event) => events.dispatchEvent(event),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  });
  return import("./storage");
}

describe("storage (B3, B4)", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("keeps only UUID-shaped chat ids, so one bad saved id can't hide the list", async () => {
    const storage = fakeStorage({ "sneakoscope.sessions": JSON.stringify([A, "not-an-id", 42, B, "../etc"]) });
    const { loadSessionIds, sessionIdsSnapshot } = await loadWith(storage);
    expect(loadSessionIds()).toEqual([A, B]);
    expect(sessionIdsSnapshot()).toEqual([A, B]);
  });

  it("treats corrupt JSON as no chats", async () => {
    const { loadSessionIds, dismissedAlertsSnapshot } = await loadWith(
      fakeStorage({ "sneakoscope.sessions": "{oops", "sneakoscope.dismissedAlerts": "nope" }),
    );
    expect(loadSessionIds()).toEqual([]);
    expect(dismissedAlertsSnapshot()).toEqual([]);
  });

  it("gives a stable snapshot until the stored value changes", async () => {
    const { rememberSession, sessionIdsSnapshot } = await loadWith(fakeStorage());
    const first = sessionIdsSnapshot();
    expect(sessionIdsSnapshot()).toBe(first);
    rememberSession(A);
    expect(sessionIdsSnapshot()).toEqual([A]);
    expect(sessionIdsSnapshot()).not.toBe(first);
  });

  it("moves a re-used chat to the top and ignores ids that aren't UUIDs", async () => {
    const storage = fakeStorage();
    const { rememberSession } = await loadWith(storage);
    rememberSession(A);
    rememberSession(B);
    expect(rememberSession(A)).toEqual([A, B]);
    expect(rememberSession("bad id")).toEqual([A, B]);
    expect(JSON.parse(storage.data.get("sneakoscope.sessions")!)).toEqual([A, B]);
  });

  it("never throws when localStorage itself throws, and remembers in memory for the visit", async () => {
    const { rememberSession, sessionIdsSnapshot, dismissAlert, dismissedAlertsSnapshot } = await loadWith("throws");
    expect(sessionIdsSnapshot()).toEqual([]);
    expect(() => rememberSession(A)).not.toThrow();
    expect(sessionIdsSnapshot()).toEqual([A]);
    expect(() => dismissAlert("alert-1")).not.toThrow();
    expect(dismissedAlertsSnapshot()).toEqual(["alert-1"]);
  });

  it("survives a full store (writes fail, reads work)", async () => {
    const storage = fakeStorage({}, { write: true });
    const { rememberSession, loadSessionIds } = await loadWith(storage);
    expect(() => rememberSession(A)).not.toThrow();
    expect(loadSessionIds()).toEqual([A]);
  });

  it("survives reads that throw", async () => {
    const { loadSessionIds, dismissedAlertsSnapshot } = await loadWith(fakeStorage({}, { read: true }));
    expect(loadSessionIds()).toEqual([]);
    expect(dismissedAlertsSnapshot()).toEqual([]);
  });

  it("works without a browser at all (server render)", async () => {
    vi.resetModules();
    const { loadSessionIds, sessionIdsSnapshot } = await import("./storage");
    expect(loadSessionIds()).toEqual([]);
    expect(sessionIdsSnapshot()).toEqual([]);
  });
});
