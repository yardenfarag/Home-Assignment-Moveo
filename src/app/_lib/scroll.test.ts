import { describe, expect, it } from "vitest";
import { ANSWER_TOP_GAP_PX, followTarget, isNearBottom, NEAR_BOTTOM_PX } from "./scroll";

describe("conversation scrolling (S9)", () => {
  it("counts the last few pixels as 'at the bottom'", () => {
    expect(isNearBottom({ scrollTop: 520, clientHeight: 400, scrollHeight: 1000 })).toBe(true);
    expect(isNearBottom({ scrollTop: 600 - NEAR_BOTTOM_PX - 1, clientHeight: 400, scrollHeight: 1000 })).toBe(false);
  });

  it("follows a short answer to the bottom", () => {
    expect(followTarget({ scrollTop: 500, clientHeight: 400, scrollHeight: 1000 }, 800)).toBe(600);
  });

  it("stops a long answer with its first line at the top, instead of jumping to its end", () => {
    expect(followTarget({ scrollTop: 300, clientHeight: 400, scrollHeight: 3000 }, 700)).toBe(700 - ANSWER_TOP_GAP_PX);
  });

  it("never scrolls up (once the answer's top is reached, it stays put)", () => {
    expect(followTarget({ scrollTop: 690, clientHeight: 400, scrollHeight: 3000 }, 700)).toBeNull();
    expect(followTarget({ scrollTop: 600, clientHeight: 400, scrollHeight: 1000 }, null)).toBeNull();
  });

  it("goes to the bottom when there's no answer yet (a new question)", () => {
    expect(followTarget({ scrollTop: 0, clientHeight: 400, scrollHeight: 1000 }, null)).toBe(600);
  });
});
