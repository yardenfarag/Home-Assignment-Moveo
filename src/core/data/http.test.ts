import { describe, expect, it, vi } from "vitest";
import { fetchJsonWithRetry, withTimeout, type FetchLike } from "./http";

/** A fetch that never answers, but stops when its signal aborts (like real fetch). */
const hangingFetch = ((_input: unknown, init?: RequestInit) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
  })) as typeof fetch;

describe("withTimeout", () => {
  it("aborts a request that takes longer than the deadline", async () => {
    await expect(withTimeout(hangingFetch, 20)("https://x.test")).rejects.toMatchObject({ name: "TimeoutError" });
  });

  it("still honors the caller's own abort signal", async () => {
    const controller = new AbortController();
    const request = withTimeout(hangingFetch, 60_000)("https://x.test", { signal: controller.signal });
    controller.abort(new Error("caller cancelled"));
    await expect(request).rejects.toThrow("caller cancelled");
  });

  it("passes the response through when fast enough", async () => {
    const fast = (async () => new Response("ok")) as unknown as typeof fetch;
    await expect((await withTimeout(fast, 1_000)("https://x.test")).text()).resolves.toBe("ok");
  });
});

const noSleep = vi.fn(async () => {});

function respond(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
}

describe("fetchJsonWithRetry", () => {
  const base = { url: "https://x.test", boundary: "openMeteo" as const, functionName: "f", errorName: "TestError" };

  it("returns JSON on success", async () => {
    const fetchImpl: FetchLike = vi.fn(async () => respond(200, { ok: 1 }));
    await expect(fetchJsonWithRetry({ ...base, fetchImpl, sleepImpl: noSleep })).resolves.toEqual({ ok: 1 });
  });

  it("retries 429 then succeeds", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(respond(429, "slow down"))
      .mockResolvedValueOnce(respond(200, { ok: 2 }));
    await expect(fetchJsonWithRetry({ ...base, fetchImpl, sleepImpl: noSleep, backoffMs: [1] })).resolves.toEqual({
      ok: 2,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 400 and throws in the unified format", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => respond(400, "bad request"));
    await expect(fetchJsonWithRetry({ ...base, fetchImpl, sleepImpl: noSleep, backoffMs: [1, 1] })).rejects.toThrow(
      "TestError || Request failed (HTTP 400: bad request) || f || 🐸",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("gives up after all retries on network errors", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => {
      throw new Error("ECONNRESET");
    });
    await expect(fetchJsonWithRetry({ ...base, fetchImpl, sleepImpl: noSleep, backoffMs: [1, 1] })).rejects.toThrow(
      /network error: ECONNRESET/,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
