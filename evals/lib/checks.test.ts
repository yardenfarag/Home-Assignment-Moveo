import { describe, expect, it } from "vitest";
import type { ToolCallRecord } from "../../src/core/agent/answerSchema";
import { duplicateCalls, firstHubMentioned, textHasNumber } from "./checks";

describe("firstHubMentioned", () => {
  const hubs = [
    { id: "detroit", name: "Detroit" },
    { id: "minneapolis", name: "Minneapolis" },
  ];
  it("returns the hub whose name appears earliest", () => {
    expect(firstHubMentioned("Minneapolis is first, then Detroit.", hubs)).toBe("minneapolis");
    expect(firstHubMentioned("No hub here.", hubs)).toBeNull();
  });
});

describe("textHasNumber", () => {
  it("accepts the number as written with display rounding", () => {
    expect(textHasNumber("About 9% of days", 9.04)).toBe(true);
    expect(textHasNumber("9.0% of days", 9.04)).toBe(true);
    expect(textHasNumber("Scores 72.4 overall", 72.4)).toBe(true);
    expect(textHasNumber("Scores 71 overall", 72.4)).toBe(false);
  });
});

describe("duplicateCalls", () => {
  it("counts repeats of the same tool with the same input", () => {
    const call = (tool: string, input: unknown): ToolCallRecord => ({ tool, input, output: {} });
    expect(
      duplicateCalls([call("rank_hubs", { a: 1 }), call("rank_hubs", { a: 1 }), call("rank_hubs", { a: 2 }), call("rank_hubs", { a: 1 })]),
    ).toBe(2);
  });
});
