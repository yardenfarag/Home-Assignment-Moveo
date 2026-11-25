/**
 * @module core/agent/createAnswerQuestionDeps
 *
 * Wires the real model (OpenRouter) and Supabase repositories into
 * {@link AnswerQuestionDeps}.
 */
import { ensureSession, loadHistory, saveTurn } from "../db/chatRepository";
import { recordEvent } from "../db/eventsRepository";
import { listActiveHubs } from "../db/hubsRepository";
import { getLatestSnapshots } from "../db/scoresRepository";
import { getWeatherBounds, getWeatherDays } from "../db/weatherRepository";
import { supabaseAnswerCache } from "../db/answerCacheRepository";
import { createGuard } from "../guard/jevGuard";
import { toIsoDate } from "../utils/dates";
import type { AnswerQuestionDeps } from "./answerQuestion";
import { loadAgentContext } from "./context";
import { createAgentModel } from "./model";

/**
 * Builds production dependencies.
 * @param options - optional model override (e.g. the Step 8 bakeoff), and whether to use the answer
 *   cache (D136; only the chat route turns it on, and never for the eval script's operator requests).
 * @returns the dependencies.
 * @throws BoundaryError (config) when OpenRouter env variables are missing.
 */
export function createAnswerQuestionDeps(options: { modelOverride?: string; useAnswerCache?: boolean } = {}): AnswerQuestionDeps {
  return {
    agentModel: createAgentModel(process.env, options.modelOverride),
    loadContext: (contextOptions) =>
      loadAgentContext(
        {
          listActiveHubs: () => listActiveHubs(),
          getLatestSnapshots: () => getLatestSnapshots(),
          getWeatherBounds: () => getWeatherBounds(),
          getWeatherDays: (hubId, start, end) => getWeatherDays(hubId, start, end),
        },
        contextOptions,
      ),
    ensureSession: (sessionId) => ensureSession(sessionId),
    loadHistory: (sessionId, turns) => loadHistory(sessionId, turns),
    saveTurn: (sessionId, messages, answer, model) => saveTurn(sessionId, messages, answer, model),
    recordEvent: (event) => recordEvent(event),
    guard: createGuard(),
    today: () => toIsoDate(new Date()),
    answerCache: options.useAnswerCache ? supabaseAnswerCache : undefined,
  };
}
