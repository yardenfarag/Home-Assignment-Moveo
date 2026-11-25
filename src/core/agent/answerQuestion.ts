/**
 * @module core/agent/answerQuestion
 *
 * The ONE entry point for answering a chat message — used by `npm run ask`
 * and (Step 5) `POST /api/chat`. Loads context + memory, runs the agent,
 * saves the turn, and logs events under one correlation id per turn.
 */
import { randomUUID } from "node:crypto";
import type { ModelMessage } from "ai";
import type { NewEvent } from "../db/eventsRepository";
import { describeUnknownError } from "../errors/boundaryError";
import type { UnitSystem } from "../utils/units";
import type { FinalAnswer } from "./answerSchema";
import { HISTORY_TURNS } from "./config";
import type { AgentContext } from "./context";
import type { AgentModel } from "./model";
import { runAgent, type AgentCallbacks, type AgentResult } from "./runAgent";

/** A chat message from the user. */
export interface QuestionInput {
  /** Existing session id from the browser, or null to start a new conversation. */
  sessionId: string | null;
  message: string;
  units: UnitSystem;
}

/** Everything answerQuestion needs (injectable for tests). */
export interface AnswerQuestionDeps {
  agentModel: AgentModel;
  loadContext: (options: { today: string; units: UnitSystem }) => Promise<AgentContext>;
  ensureSession: (sessionId: string | null) => Promise<string>;
  loadHistory: (sessionId: string, turns: number) => Promise<ModelMessage[]>;
  saveTurn: (sessionId: string, messages: ModelMessage[], answer: FinalAnswer, model: string) => Promise<void>;
  recordEvent: (event: NewEvent) => Promise<boolean>;
  /** Today `YYYY-MM-DD` (UTC). */
  today: () => string;
}

/** The result returned to the caller. */
export interface QuestionResult {
  sessionId: string;
  answer: FinalAnswer;
  usage: AgentResult["usage"];
}

/**
 * Answers one chat message end to end.
 * @param input - session, message and unit system.
 * @param deps - model, data access and logging.
 * @param callbacks - live progress hooks.
 * @returns the session id, the checked answer and token usage.
 * @throws AgentInputError / BoundaryError — also logged as an `agent.failed` event.
 */
export async function answerQuestion(
  input: QuestionInput,
  deps: AnswerQuestionDeps,
  callbacks: AgentCallbacks = {},
): Promise<QuestionResult> {
  const correlationId = randomUUID();
  const sessionId = await deps.ensureSession(input.sessionId);
  try {
    const [context, history] = await Promise.all([
      deps.loadContext({ today: deps.today(), units: input.units }),
      deps.loadHistory(sessionId, HISTORY_TURNS),
    ]);
    const result = await runAgent(
      { message: input.message, history },
      { model: deps.agentModel.model, modelId: deps.agentModel.modelId, context },
      {
        ...callbacks,
        onRetry: (problems) => {
          void deps.recordEvent({
            eventType: "agent.retry",
            source: "agent",
            level: "warn",
            correlationId,
            sessionId,
            message: problems.join(" | "),
            payload: { problems },
          });
          callbacks.onRetry?.(problems);
        },
      },
    );
    await deps.saveTurn(sessionId, result.newMessages, result.answer, deps.agentModel.modelId);
    await deps.recordEvent({
      eventType: "agent.answered",
      source: "agent",
      level: result.answer.meta.warnings.length > 0 ? "warn" : "info",
      correlationId,
      sessionId,
      message: `${result.answer.meta.toolCalls.length} tool calls, confidence ${result.answer.confidence ?? "n/a"}`,
      payload: {
        model: deps.agentModel.modelId,
        tools: result.answer.meta.toolCalls.map((c) => c.tool),
        outOfScope: result.answer.outOfScope,
        retried: result.answer.meta.retried,
        confidence: result.answer.confidence,
        confidenceOverridden: result.answer.meta.confidenceOverridden,
        premiseHolds: result.answer.premiseCheck?.holds ?? null,
        warnings: result.answer.meta.warnings,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      },
    });
    return { sessionId, answer: result.answer, usage: result.usage };
  } catch (error) {
    await deps.recordEvent({
      eventType: "agent.failed",
      source: "agent",
      level: "error",
      correlationId,
      sessionId,
      message: describeUnknownError(error),
      payload: { model: deps.agentModel.modelId },
    });
    throw error;
  }
}
