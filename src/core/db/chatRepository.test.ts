import { describe, expect, it } from "vitest";
import { RETRY_FEEDBACK_PREFIX } from "../agent/config";
import { isRetryFeedback } from "./chatRepository";

describe("isRetryFeedback", () => {
  it("tells the validation-retry feedback apart from a real question", () => {
    expect(isRetryFeedback({ role: "user", content: `${RETRY_FEEDBACK_PREFIX}\n- numbers don't match` })).toBe(true);
    expect(isRetryFeedback({ role: "user", content: "Why is Dallas high?" })).toBe(false);
    expect(isRetryFeedback({ role: "user", content: [{ type: "text", text: "hi" }] })).toBe(false);
    expect(isRetryFeedback(null)).toBe(false);
  });
});
