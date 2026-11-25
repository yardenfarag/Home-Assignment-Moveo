import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson, HttpError, timeoutSignal } from "./fetchJson";

/** A fetch that never answers, but rejects like the browser when its signal aborts. */
const hangingFetch = (_url: string, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
  });

describe("fetchJson (S3: every request has a timeout)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the parsed body", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ ok: 1 }));
    await expect(fetchJson<{ ok: number }>("/api/x")).resolves.toEqual({ ok: 1 });
  });

  it("throws HttpError with the parsed body for a non-2xx answer", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ error: { message: "nope" } }, { status: 429 }));
    const error = await fetchJson("/api/x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(429);
    expect((error as HttpError).body).toEqual({ error: { message: "nope" } });
  });

  it("throws when a 2xx answer isn't JSON", async () => {
    vi.stubGlobal("fetch", async () => new Response("<html>"));
    await expect(fetchJson("/api/x")).rejects.toBeInstanceOf(HttpError);
  });

  it("gives up after the timeout instead of hanging", async () => {
    vi.stubGlobal("fetch", hangingFetch);
    const error = await fetchJson("/api/x", { timeoutMs: 20 }).catch((e: unknown) => e);
    expect((error as DOMException).name).toBe("TimeoutError");
  });

  it("stops early when the caller's signal aborts (a newer request replaced it)", async () => {
    vi.stubGlobal("fetch", hangingFetch);
    const controller = new AbortController();
    const pending = fetchJson("/api/x", { signal: controller.signal, timeoutMs: 10_000 }).catch((e: unknown) => e);
    controller.abort();
    expect((await pending as DOMException).name).toBe("AbortError");
  });
});

describe("timeoutSignal", () => {
  it("is already aborted when the outside signal is", () => {
    const controller = new AbortController();
    controller.abort();
    expect(timeoutSignal(10_000, controller.signal).aborted).toBe(true);
  });
});
