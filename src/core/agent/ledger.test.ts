import type { ModelMessage } from "ai";
import { describe, expect, it } from "vitest";
import { GENERAL_CAVEATS, hazardCaveats, standingCaveatCatalog } from "../scoring/caveats";
import { ToolLedger, type ToolOutputBase } from "./ledger";
import { runTool } from "./tools/shared";

const floodCaveats = hazardCaveats("flood", "us");

/** A tool output with the given caveats. */
const outputWith = (caveats: string[], extra: Record<string, unknown> = {}): ToolOutputBase => ({ hubIds: ["dallas"], confidence: "high", caveats, ...extra });

/**
 * One earlier turn's tool result, as stored in the conversation history (what the model saw).
 * @param value - the tool output the model got.
 * @returns the history messages.
 */
function historyWith(value: ToolOutputBase): ModelMessage[] {
  return [
    { role: "user", content: "Earlier question" },
    { role: "assistant", content: [{ type: "tool-call", toolCallId: "c1", toolName: "rank_hubs", input: {} }] },
    { role: "tool", content: [{ type: "tool-result", toolCallId: "c1", toolName: "rank_hubs", output: { type: "json", value: value as never } }] },
  ];
}

describe("standingCaveatCatalog", () => {
  it("gives every standing caveat a unique id and has no text twice, in both unit systems", () => {
    for (const units of ["us", "metric"] as const) {
      const catalog = standingCaveatCatalog(units);
      expect(new Set(catalog.map((c) => c.id)).size).toBe(catalog.length);
      expect(new Set(catalog.map((c) => c.text)).size).toBe(catalog.length);
    }
    expect(standingCaveatCatalog("us").slice(0, 2)).toEqual([
      { id: "general-1", text: GENERAL_CAVEATS[0] },
      { id: "general-2", text: GENERAL_CAVEATS[1] },
    ]);
  });
});

describe("ToolLedger — each caveat's text reaches the model once per conversation", () => {
  it("names a caveat by id after the model got its text in an earlier call of the same turn", async () => {
    const ledger = new ToolLedger();
    const runtime = { ledger, callbacks: {} };
    const first = await runTool("rank_hubs", { a: 1 }, runtime, () => outputWith([...GENERAL_CAVEATS]));
    const second = await runTool("rank_hubs", { a: 2 }, runtime, () => outputWith([...GENERAL_CAVEATS, ...floodCaveats]));

    expect(first.caveats).toEqual(GENERAL_CAVEATS);
    expect(first.caveatsGivenEarlier).toBeUndefined();
    expect(second.caveats).toEqual(floodCaveats); // only the new ones in full
    expect(second.caveatsGivenEarlier).toEqual(["general-1", "general-2"]);
  });

  it("still keeps every caveat in full for the answer's limitations and the stored tool calls", async () => {
    const ledger = new ToolLedger();
    const runtime = { ledger, callbacks: {} };
    await runTool("rank_hubs", { a: 1 }, runtime, () => outputWith([...GENERAL_CAVEATS]));
    await runTool("rank_hubs", { a: 2 }, runtime, () => outputWith([...GENERAL_CAVEATS, ...floodCaveats]));
    expect(ledger.caveats()).toEqual([...GENERAL_CAVEATS, ...floodCaveats]);
    expect((ledger.calls[1].output as ToolOutputBase).caveats).toEqual([...GENERAL_CAVEATS, ...floodCaveats]);
    expect((ledger.calls[1].output as ToolOutputBase).caveatsGivenEarlier).toBeUndefined();
  });

  it("doesn't repeat caveats an earlier turn already sent in full", async () => {
    const ledger = new ToolLedger();
    ledger.seedFromHistory(historyWith(outputWith([...GENERAL_CAVEATS])));
    const output = await runTool("rank_hubs", { a: 1 }, { ledger, callbacks: {} }, () => outputWith([...GENERAL_CAVEATS, ...floodCaveats]));
    expect(output.caveats).toEqual(floodCaveats);
    expect(output.caveatsGivenEarlier).toEqual(["general-1", "general-2"]);
  });

  it("sends a caveat again when the turn that carried its text is no longer in the history window", async () => {
    const ledger = new ToolLedger();
    // The only earlier result left in the window named the caveats by id: the model no longer has their text.
    ledger.seedFromHistory(historyWith(outputWith([], { caveatsGivenEarlier: ["general-1", "general-2"] })));
    const output = await runTool("rank_hubs", { a: 1 }, { ledger, callbacks: {} }, () => outputWith([...GENERAL_CAVEATS]));
    expect(output.caveats).toEqual(GENERAL_CAVEATS);
    expect(output.caveatsGivenEarlier).toBeUndefined();
  });

  it("turns caveat ids from earlier turns back into text for a follow-up that calls no tools (G4)", () => {
    const ledger = new ToolLedger();
    ledger.seedFromHistory(historyWith(outputWith([floodCaveats[0]], { caveatsGivenEarlier: ["general-1", "no-such-id", 7] })));
    expect(ledger.caveats()).toEqual([floodCaveats[0], GENERAL_CAVEATS[0]]); // unknown ids are skipped
  });

  it("always sends caveats that aren't standing ones (e.g. a period's notes) in full", async () => {
    const ledger = new ToolLedger();
    const runtime = { ledger, callbacks: {} };
    const note = "2026 is incomplete: data runs to 2026-11-24.";
    await runTool("get_weather_stat", { a: 1 }, runtime, () => outputWith([note]));
    const second = await runTool("get_weather_stat", { a: 2 }, runtime, () => outputWith([note]));
    expect(second.caveats).toEqual([note]);
  });
});
