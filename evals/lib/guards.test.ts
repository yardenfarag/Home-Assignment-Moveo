import { describe, expect, it } from "vitest";
import { isStrayAbort } from "./guards";

describe("isStrayAbort", () => {
  it("matches the provider's stray timeout/abort rejections only", () => {
    expect(isStrayAbort(new DOMException("Step timeout of 25000ms exceeded", "TimeoutError"))).toBe(true);
    expect(isStrayAbort(new DOMException("aborted", "AbortError"))).toBe(true);
    expect(isStrayAbort(new Error("database down"))).toBe(false);
    expect(isStrayAbort("TimeoutError")).toBe(false);
    expect(isStrayAbort(null)).toBe(false);
  });
});
