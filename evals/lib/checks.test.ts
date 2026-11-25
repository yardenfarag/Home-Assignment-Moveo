import { describe, expect, it } from "vitest";
import type { FinalAnswer, ToolCallRecord } from "../../src/core/agent/answerSchema";
import { duplicateCalls, firstHubMentioned, mentionsHub, sentences, someSentence, statesNumber } from "./checks";

describe("firstHubMentioned", () => {
  const hubs = [
    { id: "detroit", name: "Detroit" },
    { id: "minneapolis", name: "Minneapolis" },
    { id: "st-louis", name: "St. Louis" },
  ];
  it("returns the hub whose name appears earliest", () => {
    expect(firstHubMentioned("Minneapolis is first, then Detroit.", hubs)).toBe("minneapolis");
    expect(firstHubMentioned("No hub here.", hubs)).toBeNull();
  });

  it("tolerates case and the St / St. / Saint spellings (N5)", () => {
    expect(firstHubMentioned("saint louis leads, then Detroit.", hubs)).toBe("st-louis");
    expect(firstHubMentioned("ST LOUIS leads, then Detroit.", hubs)).toBe("st-louis");
    expect(mentionsHub("St Louis is third.", "St. Louis")).toBe(true);
    expect(mentionsHub("MINNEAPOLIS", "Minneapolis")).toBe(true);
  });
});

describe("sentences", () => {
  it("splits on sentence ends and lines, not inside numbers or after St.", () => {
    expect(sentences("Houston scores **72.2**. St. Louis is next.\n- Miami: 48.9")).toEqual(["Houston scores 72.2.", "St. Louis is next.", "- Miami: 48.9"]);
  });

  it("someSentence needs every pattern in the same sentence", () => {
    expect(someSentence("Dust storms are common. We don't score them.", /dust/i, /don't score/i)).toBe(false);
    expect(someSentence("We don't score dust storms.", /dust/i, /don't score/i)).toBe(true);
  });
});

/** An answer with the given text and dataUsed entries. */
const answer = (text: string, dataUsed: FinalAnswer["dataUsed"]): FinalAnswer => ({ answer: text, dataUsed }) as unknown as FinalAnswer;

describe("statesNumber (B8)", () => {
  const miami = { hubId: "miami", hubName: "Miami", label: "hurricane score", topic: /hurricane/i, expected: 100 };
  const miamiData = [{ hubId: "miami", label: "hurricane exposure score", value: 100, unit: "score 0-100" }];

  it("passes when the number is in dataUsed for that hub AND written next to the hub or topic", () => {
    expect(statesNumber(answer("- **Hurricane:** Miami scores **100** (high), compared with Houston’s **74**.", miamiData), miami).pass).toBe(true);
  });

  it("fails a stray 100 from a scale phrase, even with the right dataUsed", () => {
    const result = statesNumber(answer("Scores run on a 0–100 scale. Miami's hurricane exposure is the highest of all hubs.", miamiData), miami);
    expect(result.pass).toBe(false);
    expect(result.detail).toMatch(/not written/);
    expect(statesNumber(answer("Miami's hurricane exposure is high on our 0–100 scale (out of 100).", miamiData), miami).pass).toBe(false);
  });

  it("fails when dataUsed doesn't tie the number to the hub", () => {
    const houstonOnly = [{ hubId: "houston", label: "hurricane exposure score", value: 100, unit: "score 0-100" }];
    expect(statesNumber(answer("Miami's hurricane score is 100.", houstonOnly), miami).pass).toBe(false);
  });

  it("needs a percent sign for a percentage: '9 of 36 hubs' is not 9%", () => {
    const denver = { hubId: "denver", hubName: "Denver", label: "days with snow", topic: /snow/i, expected: 9.04, percent: true };
    const data = [{ hubId: "denver", label: "Percentage of days with measurable snow in 2025", value: 9, unit: "%" }];
    expect(statesNumber(answer("Denver had snow on 33 days, more than 9 of 36 hubs.", data), denver).pass).toBe(false);
    expect(statesNumber(answer("In 2025, Denver had measurable snowfall on **9% of days**.", data), denver).pass).toBe(true);
    expect(statesNumber(answer("In 2025, Denver had measurable snowfall on 9.0 percent of days.", data), denver).pass).toBe(true);
  });

  it("allows display rounding (72.4 written as 72.4, not 71)", () => {
    const dallas = { hubId: "dallas", hubName: "Dallas", label: "overall score", topic: /overall/i, expected: 72.4 };
    const data = [{ hubId: "dallas", label: "overall risk score", value: 72.4, unit: "score 0-100" }];
    expect(statesNumber(answer("Dallas scores 72.4 overall.", data), dallas).pass).toBe(true);
    expect(statesNumber(answer("Dallas scores 71 overall.", data), dallas).pass).toBe(false);
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
