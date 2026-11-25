/**
 * @module core/agent/usage
 *
 * What one answer cost (Step 18, D136): tokens in and out, how many input tokens the provider
 * served from its prompt cache, and the cost OpenRouter actually charged. Also decides which
 * models need an explicit prompt-cache marker.
 *
 * OpenRouter reports usage on every response (no opt-in needed). Cached input tokens arrive as
 * the AI SDK's `inputTokenDetails.cacheReadTokens`; the charged cost (USD credits) arrives per
 * step in `providerMetadata.openrouter.usage.cost`.
 */
import type { SystemModelMessage } from "ai";

/** Token and cost totals for one answer (or one attempt). */
export interface AnswerUsage {
  /** All input tokens, cached ones included. */
  inputTokens: number;
  outputTokens: number;
  /** Input tokens served from the provider's prompt cache (cheaper). */
  cachedInputTokens: number;
  /** Input tokens written to the prompt cache (some providers charge extra for this). */
  cacheWriteTokens: number;
  /** What OpenRouter charged, in USD; null when it didn't report a cost. */
  costUsd: number | null;
}

/** No usage yet (also what a cached answer costs). */
export const NO_USAGE: AnswerUsage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, costUsd: 0 };

/** The AI SDK usage fields we read (a subset of `LanguageModelUsage`). */
interface SdkUsage {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  inputTokenDetails?: { cacheReadTokens: number | undefined; cacheWriteTokens: number | undefined };
}

/**
 * One attempt's usage from the AI SDK totals and the per-step provider metadata.
 * @param total - `result.totalUsage`.
 * @param steps - `result.steps` (each may carry `providerMetadata.openrouter.usage.cost`).
 * @returns the attempt's usage; cost is null unless every step reported one.
 */
export function attemptUsage(total: SdkUsage, steps: readonly { providerMetadata?: unknown }[]): AnswerUsage {
  const costs = steps.map((step) => (step.providerMetadata as { openrouter?: { usage?: { cost?: unknown } } } | undefined)?.openrouter?.usage?.cost);
  const allReported = costs.length > 0 && costs.every((cost) => typeof cost === "number");
  return {
    inputTokens: total.inputTokens ?? 0,
    outputTokens: total.outputTokens ?? 0,
    cachedInputTokens: total.inputTokenDetails?.cacheReadTokens ?? 0,
    cacheWriteTokens: total.inputTokenDetails?.cacheWriteTokens ?? 0,
    costUsd: allReported ? (costs as number[]).reduce((sum, cost) => sum + cost, 0) : null,
  };
}

/**
 * Adds two usages (an answer's attempts). An unknown cost makes the sum unknown.
 * @param a - first.
 * @param b - second.
 * @returns the sum.
 */
export function addUsage(a: AnswerUsage, b: AnswerUsage): AnswerUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    costUsd: a.costUsd === null || b.costUsd === null ? null : a.costUsd + b.costUsd,
  };
}

/**
 * Providers whose prompt cache only works with an explicit `cache_control` breakpoint on OpenRouter
 * (OpenAI, DeepSeek, xAI and others cache automatically once the prompt is 1,024+ tokens).
 */
export const EXPLICIT_CACHE_PROVIDERS: readonly string[] = ["anthropic", "google", "qwen"];

/**
 * The system prompt as the model's instructions, with a cache breakpoint at its end for providers
 * that need one. The breakpoint covers everything before it: the tool definitions and the system
 * prompt, which are identical on every request (the date is the prompt's last section).
 * @param system - the system prompt text.
 * @param modelId - the OpenRouter model id, e.g. `anthropic/claude-sonnet-5.5`.
 * @returns the instructions message.
 */
export function cachedInstructions(system: string, modelId: string): SystemModelMessage {
  const provider = modelId.split("/")[0];
  if (!EXPLICIT_CACHE_PROVIDERS.includes(provider)) return { role: "system", content: system };
  return { role: "system", content: system, providerOptions: { openrouter: { cacheControl: { type: "ephemeral" } } } };
}
