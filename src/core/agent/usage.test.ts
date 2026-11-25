import { describe, expect, it } from "vitest";
import { addUsage, attemptUsage, cachedInstructions } from "./usage";

describe("answer usage and cost (D136)", () => {
  const total = { inputTokens: 3000, outputTokens: 200, inputTokenDetails: { cacheReadTokens: 2560, cacheWriteTokens: 0 } };

  it("reads cached tokens and sums the cost OpenRouter charged per step", () => {
    const usage = attemptUsage(total, [{ providerMetadata: { openrouter: { usage: { cost: 0.002 } } } }, { providerMetadata: { openrouter: { usage: { cost: 0.001 } } } }]);
    expect(usage).toMatchObject({ inputTokens: 3000, cachedInputTokens: 2560, outputTokens: 200 });
    expect(usage.costUsd).toBeCloseTo(0.003);
  });

  it("reports an unknown cost as null (never as 0) and keeps it unknown when summed", () => {
    const unknown = attemptUsage(total, [{ providerMetadata: {} }]);
    expect(unknown.costUsd).toBeNull();
    expect(addUsage(unknown, attemptUsage(total, [{ providerMetadata: { openrouter: { usage: { cost: 0.001 } } } }])).costUsd).toBeNull();
  });

  it("adds a cache breakpoint only for providers that need one", () => {
    expect(cachedInstructions("sys", "openai/gpt-6.1-terra")).toEqual({ role: "system", content: "sys" });
    expect(cachedInstructions("sys", "anthropic/claude-sonnet-5.5").providerOptions).toEqual({ openrouter: { cacheControl: { type: "ephemeral" } } });
  });
});
