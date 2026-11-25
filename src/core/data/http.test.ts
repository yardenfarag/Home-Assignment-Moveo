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
  const base = { url: "https://x.test", boundary: "openMeteo" as const, functionName: "f", errorName: "TestError", log: () => {} };

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

  it("logs every retry in the boundary format", async () => {
    const log = vi.fn();
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(respond(503, "busy"))
      .mockResolvedValueOnce(respond(200, { ok: 3 }));
    await fetchJsonWithRetry({ ...base, fetchImpl, sleepImpl: noSleep, backoffMs: [2_000], log });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toBe("TestError || Attempt 1 of 2 failed (HTTP 503: busy); retrying in 2 s || f || 🐸");
  });

  it("caps a huge Retry-After instead of sleeping for an hour", async () => {
    const sleeps: number[] = [];
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(new Response("slow down", { status: 429, headers: { "retry-after": "3600" } }))
      .mockResolvedValueOnce(respond(200, { ok: 4 }));
    await fetchJsonWithRetry({ ...base, fetchImpl, sleepImpl: async (ms) => void sleeps.push(ms), backoffMs: [1], log: () => {} });
    expect(sleeps).toEqual([30_000]);
  });

  it("fails at once, without retrying, when a 200 body is not JSON (e.g. a maintenance page)", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => new Response("<!DOCTYPE html><p>Maintenance</p>", { status: 200, headers: { "content-type": "text/html" } }));
    await expect(fetchJsonWithRetry({ ...base, fetchImpl, sleepImpl: noSleep, backoffMs: [1, 1] })).rejects.toThrow(
      /^InvalidJsonResponseError \|\| The server answered 200 but not with JSON \(content-type text\/html\): <!DOCTYPE html>.* \|\| f \|\| 🐸$/,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("stops retrying when the next wait would pass the deadline", async () => {
    let clock = 0;
    const fetchImpl = vi.fn<FetchLike>(async () => respond(500, "down"));
    const run = fetchJsonWithRetry({
      ...base,
      fetchImpl,
      sleepImpl: async (ms) => void (clock += ms),
      backoffMs: [1_000, 10_000],
      now: () => clock,
      deadlineAt: 5_000,
      log: () => {},
    });
    await expect(run).rejects.toThrow(/HTTP 500: down; out of time budget, not retried/);
    expect(fetchImpl).toHaveBeenCalledTimes(2); // the 10 s wait after the 2nd attempt would end past the deadline
  });

  it("starts no request at all once the deadline has passed", async () => {
    const fetchImpl = vi.fn<FetchLike>();
    await expect(fetchJsonWithRetry({ ...base, fetchImpl, deadlineAt: 0, now: () => 1 })).rejects.toThrow(/not started; out of time budget/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
