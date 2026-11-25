import { describe, expect, it, vi } from "vitest";
import { ToolLedger } from "../ledger";
import { runTool } from "./shared";

const output = { hubIds: ["dallas"], confidence: "high" as const, caveats: ["c"], overallScore: 72.4 };

describe("runTool — duplicate calls in one answer (E8)", () => {
  it("runs a repeated identical call only once and returns a tiny 'same as earlier' reply", async () => {
    const ledger = new ToolLedger();
    const onToolStart = vi.fn();
    const body = vi.fn(async () => output);
    const runtime = { ledger, callbacks: { onToolStart } };

    await runTool("explain_hub_score", { hubId: "dallas" }, runtime, body);
    const second = await runTool("explain_hub_score", { hubId: "dallas" }, runtime, body);

    expect(body).toHaveBeenCalledOnce();
    expect(second).toMatchObject({ sameAsEarlierCall: true, hubIds: [] });
    expect(onToolStart).toHaveBeenCalledOnce(); // no second progress line in the UI
    expect(ledger.calls).toHaveLength(2); // still recorded, so the duplicate is measurable
    expect(ledger.numbers()).toContain(72.4); // the first result still counts for validation
  });

  it("also catches duplicates fired in parallel within one step", async () => {
    const ledger = new ToolLedger();
    const body = vi.fn(async () => output);
    const runtime = { ledger, callbacks: {} };
    await Promise.all([1, 2, 3].map(() => runTool("explain_hub_score", { hubId: "dallas" }, runtime, body)));
    expect(body).toHaveBeenCalledOnce();
  });

  it("different inputs still run", async () => {
    const ledger = new ToolLedger();
    const body = vi.fn(async () => output);
    const runtime = { ledger, callbacks: {} };
    await runTool("explain_hub_score", { hubId: "dallas" }, runtime, body);
    await runTool("explain_hub_score", { hubId: "miami" }, runtime, body);
    expect(body).toHaveBeenCalledTimes(2);
  });
});
