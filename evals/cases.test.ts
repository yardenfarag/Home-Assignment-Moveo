import { describe, expect, it } from "vitest";
import type { FinalAnswer } from "../src/core/agent/answerSchema";
import { EVAL_CASES } from "./cases";
import { plainText } from "./lib/checks";
import type { Oracle } from "./lib/oracle";

/** Runs one case's checks on a single answer text (wording checks only need the text). */
async function wordingChecks(caseId: string, text: string) {
  const evalCase = EVAL_CASES.find((c) => c.id === caseId)!;
  const answer = { answer: text, hubsMentioned: [], dataUsed: [], outOfScope: false, meta: { toolCalls: [] } } as unknown as FinalAnswer;
  return evalCase.check([{ question: evalCase.turns[0], answer, ms: 1 }], {} as Oracle);
}

describe("plainText", () => {
  it("turns typographic quotes into plain ones", () => {
    expect(plainText("Dust storms aren’t tracked — “really”")).toBe(`Dust storms aren't tracked — "really"`);
  });
});

describe("wording checks accept correct answers in any phrasing (bakeoff false failures)", () => {
  it.each([
    "Boise is not one of the hubs covered by our weather-risk data, so I can’t assess its risk.",
    "Boise is not one of our covered hubs, so I can’t provide a weather-risk assessment for it.",
    "Boise isn't one of our hubs.",
  ])("unknown city: %s", async (text) => {
    const checks = await wordingChecks("unknown-city", text);
    expect(checks.find((c) => c.name.startsWith("says Boise"))?.pass).toBe(true);
  });

  it.each([
    "I can’t determine the Phoenix hub’s dust-storm exposure from the available risk data. Dust storms aren’t a tracked hazard.",
    "Dust storms are not a scored hazard, so the model does not provide a dust-storm frequency.",
  ])("dust storms: %s", async (text) => {
    const checks = await wordingChecks("dust-storm", text);
    expect(checks.find((c) => c.name.startsWith("says dust"))?.pass).toBe(true);
  });

  it("still fails an answer that never says Boise is outside our hubs", async () => {
    const checks = await wordingChecks("unknown-city", "Boise has moderate winter risk.");
    expect(checks.find((c) => c.name.startsWith("says Boise"))?.pass).toBe(false);
  });
});
