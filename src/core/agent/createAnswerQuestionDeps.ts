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
import { toIsoDate } from "../utils/dates";
import type { AnswerQuestionDeps } from "./answerQuestion";
import { loadAgentContext } from "./context";
import { createAgentModel } from "./model";

/**
 * Builds production dependencies.
 * @param options - optional model override (e.g. the Step 8 bakeoff).
 * @returns the dependencies.
 * @throws BoundaryError (config) when OpenRouter env variables are missing.
 */
export function createAnswerQuestionDeps(options: { modelOverride?: string } = {}): AnswerQuestionDeps {
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
    today: () => toIsoDate(new Date()),
  };
}
