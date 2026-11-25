/**
 * @module core/agent/model
 *
 * Creates the chat model through OpenRouter (so we can compare models later, D27).
 */
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { getOpenRouterEnv, type EnvSource } from "../config/env";

/** A model plus the id we log and store with answers. */
export interface AgentModel {
  model: LanguageModel;
  modelId: string;
}

/**
 * Builds the OpenRouter chat model from env (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`).
 * @param source - env variables (injectable for tests).
 * @param modelOverride - use this model id instead of `OPENROUTER_MODEL` (e.g. the Step 8 bakeoff).
 * @returns the model and its id.
 * @throws BoundaryError (config) when env variables are missing.
 */
export function createAgentModel(source: EnvSource = process.env, modelOverride?: string): AgentModel {
  const env = getOpenRouterEnv(source);
  const modelId = modelOverride ?? env.OPENROUTER_MODEL;
  return { model: createOpenRouter({ apiKey: env.OPENROUTER_API_KEY }).chat(modelId), modelId };
}
