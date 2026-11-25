import { describe, expect, it } from "vitest";
import { installStrayAbortGuard, isStrayAbort, uninstallStrayAbortGuard } from "./guards";

describe("isStrayAbort", () => {
  it("matches the provider's stray timeout/abort rejections only", () => {
    expect(isStrayAbort(new DOMException("Step timeout of 25000ms exceeded", "TimeoutError"))).toBe(true);
    expect(isStrayAbort(new DOMException("aborted", "AbortError"))).toBe(true);
    expect(isStrayAbort(new Error("database down"))).toBe(false);
    expect(isStrayAbort("TimeoutError")).toBe(false);
    expect(isStrayAbort(null)).toBe(false);
  });
});

describe("installStrayAbortGuard", () => {
  it("is idempotent: installing twice adds one listener (S7)", () => {
    const before = process.listenerCount("unhandledRejection");
    installStrayAbortGuard();
    installStrayAbortGuard();
    expect(process.listenerCount("unhandledRejection")).toBe(before + 1);
    uninstallStrayAbortGuard();
    expect(process.listenerCount("unhandledRejection")).toBe(before);
  });
});
