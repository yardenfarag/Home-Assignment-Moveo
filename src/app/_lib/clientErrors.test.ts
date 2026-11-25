import { describe, expect, it } from "vitest";
import { STREAM_INTERRUPTED, USER_ERRORS } from "@/core/errors/userErrors";
import { ANSWER_STALLED, CONNECTION_FAILED, isNetworkError, requestError } from "./clientErrors";

describe("requestError (B5: one friendly card, never raw text)", () => {
  it("uses our API's JSON error body as is", () => {
    const body = { error: { code: "too_many_requests", message: "Slow down 😸", hint: "Try again soon.", retryable: false } };
    expect(requestError(new Error(JSON.stringify(body)))).toEqual(body.error);
  });

  it("fills a partial JSON error with the code's defaults", () => {
    const card = requestError(new Error(JSON.stringify({ error: { code: "no_data", message: "Not yet." } })));
    expect(card).toEqual({ code: "no_data", message: "Not yet.", hint: USER_ERRORS.no_data.hint, retryable: true });
  });

  it("recognises the stream's friendly plain-text message and keeps its hint", () => {
    const card = requestError(new Error(USER_ERRORS.agent_failed.message));
    expect(card.code).toBe("agent_failed");
    expect(card.hint).toBe(USER_ERRORS.agent_failed.hint);
  });

  it("maps network failures to a connection message (before vs during an answer)", () => {
    for (const message of ["Failed to fetch", "NetworkError when attempting to fetch resource.", "Load failed"]) {
      expect(requestError(new TypeError(message))).toEqual(CONNECTION_FAILED);
      expect(requestError(new TypeError(message), true)).toEqual(STREAM_INTERRUPTED);
    }
  });

  it("maps a timeout to the stalled message", () => {
    expect(requestError(new DOMException("timed out", "TimeoutError"))).toEqual(ANSWER_STALLED);
  });

  it("never shows unknown raw text: falls back to the generic message", () => {
    const card = requestError(new Error("Unexpected token < in JSON at position 0"));
    expect(card.message).toBe(USER_ERRORS.internal_error.message);
    expect(requestError(new Error(JSON.stringify({ error: { code: 500 } }))).message).toBe(USER_ERRORS.internal_error.message);
  });

  it("only counts real network TypeErrors as network errors", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new TypeError("x is not a function"))).toBe(false);
    expect(isNetworkError(new Error("Failed to fetch"))).toBe(false);
  });
});
