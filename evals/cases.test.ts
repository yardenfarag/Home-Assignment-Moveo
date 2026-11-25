import { describe, expect, it } from "vitest";
import type { FinalAnswer } from "../src/core/agent/answerSchema";
import { EVAL_CASES } from "./cases";
import { plainText } from "./lib/checks";
import type { Oracle } from "./lib/oracle";

/** A fake oracle with fixed expected values (the real one reads the database). */
const oracle = (over: Partial<Oracle> = {}): Oracle => ({
  lastYear: 2025,
  hubs: [
    { id: "miami", name: "Miami" },
    { id: "houston", name: "Houston" },
    { id: "denver", name: "Denver" },
    { id: "seattle", name: "Seattle" },
  ],
  ranking: () => [],
  level: () => "low",
  hazardScore: (hubId, hazard) => (hubId === "miami" && hazard === "hurricane" ? 100 : hubId === "houston" && hazard === "flood" ? 72.2 : 0),
  hazardConfidence: () => "medium",
  yearPercent: async () => 9.04,
  ...over,
});

/**
 * Runs one case's checks on a single answer.
 * @param caseId - the case.
 * @param text - the answer text.
 * @param extra - other answer fields (dataUsed, premiseCheck, confidence…).
 * @param o - the oracle.
 * @returns the checks.
 */
async function runChecks(caseId: string, text: string, extra: Partial<FinalAnswer> = {}, o: Oracle = oracle()) {
  const evalCase = EVAL_CASES.find((c) => c.id === caseId)!;
  const answer = { answer: text, hubsMentioned: [], dataUsed: [], outOfScope: false, confidence: "medium", premiseCheck: null, meta: { toolCalls: [] }, ...extra } as unknown as FinalAnswer;
  return evalCase.check([{ question: evalCase.turns[0], answer, ms: 1 }], o);
}

/**
 * Whether the check whose name starts with `prefix` passed.
 * @param checks - the case's checks.
 * @param prefix - the start of the check's name.
 * @returns its pass flag (undefined when there is no such check).
 */
const passed = (checks: Awaited<ReturnType<typeof runChecks>>, prefix: string) => checks.find((c) => c.name.startsWith(prefix))?.pass;

describe("plainText", () => {
  it("turns typographic quotes into plain ones", () => {
    expect(plainText("Dust storms aren’t tracked — “really”")).toBe(`Dust storms aren't tracked — "really"`);
  });
});

describe("every check says what it guards (S2)", () => {
  it("sets a kind on each check of each case", async () => {
    for (const evalCase of EVAL_CASES) {
      const checks = await evalCase.check(
        evalCase.turns.map((question) => ({ question, answer: { answer: "", hubsMentioned: [], dataUsed: [], meta: { toolCalls: [] } } as unknown as FinalAnswer, ms: 1 })),
        oracle(),
      );
      for (const c of checks) expect(c.kind, `${evalCase.id}: ${c.name}`).toBeDefined();
    }
  });
});

describe("number checks (B8): the right hub's number, not any matching digits", () => {
  const miamiHoustonData = [
    { hubId: "miami", label: "hurricane exposure score", value: 100, unit: "score 0-100" },
    { hubId: "houston", label: "hurricane exposure score", value: 74, unit: "score 0-100" },
    { hubId: "houston", label: "flood exposure score", value: 72.2, unit: "score 0-100" },
    { hubId: "miami", label: "flood exposure score", value: 48.9, unit: "score 0-100" },
  ];

  it("passes a real answer (GPT-6.1 Terra, bakeoff)", async () => {
    const checks = await runChecks(
      "miami-vs-houston",
      "**Miami has greater hurricane exposure, while Houston has greater flood exposure.**\n\n- **Hurricane:** Miami scores **100** (high), compared with Houston’s **74** (high).\n- **Flood:** Houston scores **72.2** (high), compared with Miami’s **48.9** (medium).",
      { dataUsed: miamiHoustonData },
    );
    expect(passed(checks, "Miami hurricane")).toBe(true);
    expect(passed(checks, "Houston flood")).toBe(true);
  });

  it("fails an answer whose only '100' is the scale (it used to pass)", async () => {
    const checks = await runChecks("miami-vs-houston", "All scores are on a 0–100 scale. Miami's hurricane exposure is far above Houston's, and Houston scores 72.2 for flood.", {
      dataUsed: miamiHoustonData.slice(2),
    });
    expect(passed(checks, "Miami hurricane")).toBe(false);
    expect(passed(checks, "Houston flood")).toBe(true);
  });

  it("Denver snow: '9 of 36 hubs' isn't 9% (it used to pass), '9% of days' is", async () => {
    const data = [{ hubId: "denver", label: "Percentage of days with measurable snow in 2025", value: 9, unit: "%" }];
    expect(passed(await runChecks("denver-snow", "Denver had snow on 33 days in 2025, more than 9 of 36 hubs.", { dataUsed: data }), "percentage")).toBe(false);
    expect(passed(await runChecks("denver-snow", "In calendar year 2025, Denver had measurable snowfall on **9% of days**: 33 days.", { dataUsed: data }), "percentage")).toBe(true);
  });
});

describe("seattle-false-premise (S13): the case's own assumption is a separate setup check", () => {
  const pushback = { premiseCheck: { hubId: "seattle", hazard: "hurricane", claimedLevel: "high", actualLevel: "low", holds: false } } as Partial<FinalAnswer>;

  it("passes both when Seattle hurricane is low and the answer pushes back", async () => {
    const checks = await runChecks("seattle-false-premise", "Seattle's hurricane risk is actually low.", pushback);
    expect(checks.filter((c) => c.name !== "turn 1 answered").map((c) => [c.kind, c.pass])).toEqual([
      ["setup", true],
      ["gate", true],
    ]);
  });

  it("blames the case, not the model, when the data makes the premise true", async () => {
    const checks = await runChecks("seattle-false-premise", "Seattle's hurricane risk is actually low.", pushback, oracle({ level: () => "high" }));
    expect(checks.find((c) => c.kind === "setup")?.pass).toBe(false);
    expect(passed(checks, "premise flagged")).toBe(true);
  });
});

describe("wording checks accept correct answers in any phrasing (bakeoff false failures, S3)", () => {
  it.each([
    "Boise is not one of the hubs covered by our weather-risk data, so I can’t assess its risk.",
    "Boise is not one of our covered hubs, so I can’t provide a weather-risk assessment for it.",
    "Boise isn't one of our hubs.",
    "We do not track Boise, so there is no score for it.",
    "Boise isn’t in our network.",
    "There is no hub in Boise.",
    "Boise is not a hub we cover.",
  ])("unknown city passes: %s", async (text) => {
    expect(passed(await runChecks("unknown-city", text), "says Boise")).toBe(true);
  });

  it.each([
    "Boise has moderate winter risk.",
    "We don't have rainfall data for Boise yet, but its winter risk is moderate.",
    "Boise is not high risk compared with the other hubs.",
    "We don't have that. Boise is a fine city.",
  ])("unknown city fails: %s", async (text) => {
    expect(passed(await runChecks("unknown-city", text), "says Boise")).toBe(false);
  });

  it.each([
    "I can’t determine the Phoenix hub’s dust-storm exposure from the available risk data. Dust storms aren’t a tracked hazard.",
    "Dust storms are not a scored hazard, so the model does not provide a dust-storm frequency.",
    "We don't score dust storms, so Phoenix's exposure can't be rated.",
    "Dust storms aren’t in our 12.3-point wind score or any other score.",
    "Our risk model has no dust-storm hazard, so I can't give you a dust-storm exposure score for Phoenix.",
  ])("dust storms pass: %s", async (text) => {
    expect(passed(await runChecks("dust-storm", text), "says dust")).toBe(true);
  });

  it.each([
    "Dust storms are common in Phoenix. Our wind score does not include visibility.",
    "Dust storms are not rare in Phoenix, and our wind score covers gusts.",
  ])("dust storms fail: %s", async (text) => {
    expect(passed(await runChecks("dust-storm", text), "says dust")).toBe(false);
  });

  it.each([
    "**Confidence is medium** in Seattle’s winter risk score of **60**. The sources disagree: observed weather scores **20**, while FEMA’s long-term county record scores **100**.",
    "Observed weather and FEMA's records differ sharply for Seattle.",
    "Confidence is medium because Seattle sits in a mountain county.",
  ])("confidence reason passes: %s", async (text) => {
    expect(passed(await runChecks("confidence", text), "explains why")).toBe(true);
  });

  it.each([
    "Confidence is medium. The score differs from last year's.",
    "Confidence is medium, based on FEMA's long-term county record.",
    "Confidence is medium; the scores are different for each hazard.",
  ])("confidence reason fails: %s", async (text) => {
    expect(passed(await runChecks("confidence", text), "explains why")).toBe(false);
  });
});
