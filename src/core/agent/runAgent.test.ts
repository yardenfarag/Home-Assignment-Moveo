import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
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

    expect(onToolStart).toHaveBeenCalledWith("explain_hub_score", { hubId: "dallas" });
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

  it("rejects an over-long message before calling the model", async () => {
    const model = new MockLanguageModelV4({ doStream: [] });
    await expect(
      runAgent({ message: "x".repeat(1001), history: [] }, { model, modelId: "mock/model", context: ctx }),
    ).rejects.toThrow(/too long/);
    expect(model.doStreamCalls).toHaveLength(0);
  });
});
