import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { GENERAL_CAVEATS } from "../scoring/caveats";
import { ctx, score } from "./testFixtures";
import { runAgent } from "./runAgent";


const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};

/** One model step that calls a tool. */
function toolCallStep(toolName: string, input: object) {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: "tool-call" as const, toolCallId: `call-${toolName}`, toolName, input: JSON.stringify(input) },
        { type: "finish" as const, finishReason: { unified: "tool-calls" as const, raw: undefined }, usage },
      ],
    }),
  };
}

/** One model step that writes the final JSON answer. */
function answerStep(answer: object) {
  const json = JSON.stringify(answer);
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: "text-start" as const, id: "t1" },
        { type: "text-delta" as const, id: "t1", delta: json.slice(0, 40) },
        { type: "text-delta" as const, id: "t1", delta: json.slice(40) },
        { type: "text-end" as const, id: "t1" },
        { type: "finish" as const, finishReason: { unified: "stop" as const, raw: undefined }, usage },
      ],
    }),
  };
}

const goodAnswer = {
  answer: `Yes — Dallas is High (${score.overallScore}).`,
  outOfScope: false,
  hubsMentioned: ["dallas"],
  dataUsed: [{ hubId: "dallas", label: "overall score", value: score.overallScore, unit: "score 0-100" }],
  premiseClaim: { hubId: "dallas", hazard: null, claimedLevel: "high" },
  confidence: "high",
  assumptions: [],
  limitations: [],
  followUpSuggestions: [],
  recommendation: null,
};

describe("runAgent", () => {
  it("calls tools, streams the answer text, and returns a code-checked answer", async () => {
    const model = new MockLanguageModelV4({
      doStream: [toolCallStep("explain_hub_score", { hubId: "dallas" }), answerStep(goodAnswer)],
    });
    const onToolStart = vi.fn();
    let streamed = "";
    const result = await runAgent(
      { message: "Why is the Dallas hub's risk high?", history: [] },
      { model, modelId: "mock/model", context: ctx },
      { onToolStart, onAnswerDelta: (delta) => (streamed += delta) },
    );

    // The SDK's call id keeps parallel calls apart; the label uses the hub's real name from the context.
    expect(onToolStart).toHaveBeenCalledWith("explain_hub_score", { hubId: "dallas" }, expect.any(String), `Breaking down ${ctx.hubById.get("dallas")!.name}'s risk score…`);
    expect(result.answer.premiseCheck).toMatchObject({ claimedLevel: "high", holds: score.riskLevel === "high" });
    expect(result.answer.meta.toolCalls.map((c) => c.tool)).toEqual(["explain_hub_score"]);
    expect(result.answer.limitations.length).toBeGreaterThan(0); // standing caveats added by code
    expect(streamed).toBe(goodAnswer.answer);
    expect(result.answer.meta.retried).toBe(false);
  });

  it("treats this year and last year as known facts, not untraced numbers (D122)", async () => {
    const withYears = { ...goodAnswer, answer: `Yes — Dallas is High (${score.overallScore}). Plan the upgrade for 2026, after the 2025 season.` };
    const model = new MockLanguageModelV4({ doStream: [toolCallStep("explain_hub_score", { hubId: "dallas" }), answerStep(withYears)] });
    const result = await runAgent({ message: "Should we upgrade Dallas this year?", history: [] }, { model, modelId: "mock/model", context: ctx });
    expect(ctx.today.startsWith("2026")).toBe(true);
    expect(result.answer.meta.warnings).toEqual([]);
  });

  it("retries once when the answer uses a number no tool returned, then succeeds", async () => {
    const invented = { ...goodAnswer, dataUsed: [{ hubId: "dallas", label: "overall", value: 12.34, unit: "score" }] };
    const model = new MockLanguageModelV4({
      doStream: [toolCallStep("explain_hub_score", { hubId: "dallas" }), answerStep(invented), answerStep(goodAnswer)],
    });
    const onRetry = vi.fn();
    const result = await runAgent(
      { message: "Why is Dallas high?", history: [] },
      { model, modelId: "mock/model", context: ctx },
      { onRetry },
    );
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onRetry.mock.calls[0][0][0]).toMatch(/12.34/);
    expect(result.answer.meta.retried).toBe(true);
  });

  it("gives up with a clear error after the retry also fails", async () => {
    const invented = { ...goodAnswer, dataUsed: [{ hubId: "dallas", label: "overall", value: 12.34, unit: "score" }] };
    const model = new MockLanguageModelV4({ doStream: [answerStep(invented), answerStep(invented)] });
    await expect(
      runAgent({ message: "Why is Dallas high?", history: [] }, { model, modelId: "mock/model", context: ctx }),
    ).rejects.toThrow(/AgentAnswerValidationError \|\| .*12.34.* \|\| runAgent \|\| 🦉/);
  });

  it("trusts tool results from earlier turns, so follow-ups don't need to re-call tools (D25)", async () => {
    const history = [
      { role: "user" as const, content: "Why is Dallas high?" },
      {
        role: "assistant" as const,
        content: [{ type: "tool-call" as const, toolCallId: "c1", toolName: "explain_hub_score", input: { hubId: "dallas" } }],
      },
      {
        role: "tool" as const,
        content: [
          {
            type: "tool-result" as const,
            toolCallId: "c1",
            toolName: "explain_hub_score",
            output: {
              type: "json" as const,
              value: { hubId: "dallas", overallScore: score.overallScore, hubIds: ["dallas"], confidence: "high", caveats: [] },
            },
          },
        ],
      },
    ];
    const followUp = { ...goodAnswer, premiseClaim: null, answer: `As before, ${score.overallScore}.` };
    const model = new MockLanguageModelV4({ doStream: [answerStep(followUp)] });
    const onRetry = vi.fn();
    const result = await runAgent(
      { message: "Remind me of its score?", history },
      { model, modelId: "mock/model", context: ctx },
      { onRetry },
    );
    expect(onRetry).not.toHaveBeenCalled();
    expect(result.answer.confidence).toBe("high");
  });

  it("sends each caveat's text once per conversation, yet every answer still lists the caveats (G4)", async () => {
    // Turn 1: explain_hub_score sends every caveat in full.
    const turn1 = await runAgent(
      { message: "Why is Dallas high?", history: [] },
      { model: new MockLanguageModelV4({ doStream: [toolCallStep("explain_hub_score", { hubId: "dallas" }), answerStep(goodAnswer)] }), modelId: "mock/model", context: ctx },
    );
    // Turn 2: a ranking's caveats are all among them, so the model gets them by id only.
    const rankAnswer = { ...goodAnswer, premiseClaim: null };
    const turn2 = await runAgent(
      { message: "And how does it rank?", history: turn1.newMessages },
      {
        model: new MockLanguageModelV4({ doStream: [toolCallStep("rank_hubs", { metric: "overall", region: null, order: "most", limit: 1 }), answerStep(rankAnswer)] }),
        modelId: "mock/model",
        context: ctx,
      },
    );
    const sentToModel = turn2.newMessages
      .flatMap((m) => (m.role === "tool" ? m.content : []))
      .flatMap((part) => (part.type === "tool-result" && part.output.type === "json" ? [part.output.value as { caveats: string[]; caveatsGivenEarlier?: string[] }] : []));
    expect(sentToModel).toHaveLength(1);
    expect(sentToModel[0].caveats).toEqual([]);
    expect(sentToModel[0].caveatsGivenEarlier).toEqual(["general-1", "general-2"]);
    expect(turn2.answer.limitations).toEqual(expect.arrayContaining([...GENERAL_CAVEATS]));
    expect((turn2.answer.meta.toolCalls[0].output as { caveats: string[] }).caveats).toEqual(GENERAL_CAVEATS); // the stored call keeps them

    // Turn 3 calls no tools: the caveats named by id in turn 2 still reach the answer.
    const turn3 = await runAgent(
      { message: "Remind me of its score?", history: turn2.newMessages },
      { model: new MockLanguageModelV4({ doStream: [answerStep({ ...goodAnswer, premiseClaim: null })] }), modelId: "mock/model", context: ctx },
    );
    expect(turn3.answer.limitations).toEqual(expect.arrayContaining([...GENERAL_CAVEATS]));
  });

  it("rejects an over-long message before calling the model", async () => {
    const model = new MockLanguageModelV4({ doStream: [] });
    await expect(
      runAgent({ message: "x".repeat(1001), history: [] }, { model, modelId: "mock/model", context: ctx }),
    ).rejects.toThrow(/too long/);
    expect(model.doStreamCalls).toHaveLength(0);
  });
});

describe("runAgent streaming across steps", () => {
  it("starts the answer text over when the model begins a new step (no garbled text)", async () => {
    // Step 1 writes some answer text and then calls a tool; step 2 writes the real answer from scratch.
    const firstStep = {
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start" as const, id: "t0" },
          { type: "text-delta" as const, id: "t0", delta: '{"answer":"Let me check Dallas' },
          { type: "text-end" as const, id: "t0" },
          { type: "tool-call" as const, toolCallId: "call-1", toolName: "explain_hub_score", input: JSON.stringify({ hubId: "dallas" }) },
          { type: "finish" as const, finishReason: { unified: "tool-calls" as const, raw: undefined }, usage },
        ],
      }),
    };
    const model = new MockLanguageModelV4({ doStream: [firstStep, answerStep(goodAnswer)] });
    const segments: string[] = [""];
    const result = await runAgent(
      { message: "Why is the Dallas hub's risk high?", history: [] },
      { model, modelId: "mock/model", context: ctx },
      { onAnswerDelta: (delta) => (segments[segments.length - 1] += delta), onAnswerRestart: () => segments.push("") },
    );
    expect(segments.length).toBe(2); // one restart
    expect(segments[0]).toBe("Let me check Dallas");
    expect(segments[1]).toBe(goodAnswer.answer); // the final text part is exactly the answer
    expect(result.answer.answer).toBe(goodAnswer.answer);
  });
});
