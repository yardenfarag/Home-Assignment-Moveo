/**
 * @module core/agent/answerQuestion
 *
 * The ONE entry point for answering a chat message — used by `npm run ask`
 * and (Step 5) `POST /api/chat`. Loads context + memory, answers a repeated FIRST
 * question from the answer cache (D136), runs the out-of-scope guard (Step 11), runs the
 * agent, saves the turn, and logs events (tokens, cache hits, cost) under one correlation id.
 */
import { randomUUID } from "node:crypto";
import type { ModelMessage } from "ai";
import type { NewEvent } from "../db/eventsRepository";
import { AgentInputError } from "../errors/agentInputError";
import { boundaryLogLine, describeUnknownError } from "../errors/boundaryError";
import type { UnitSystem } from "../utils/units";
import { answerCacheKey, cacheExpiry, normalizeQuestion, scoresVersionOf, type AnswerCacheStore } from "./answerCache";
import type { FinalAnswer } from "./answerSchema";
import { guardDeclineAnswer, recentTurnsFromHistory, type GuardInput, type GuardVerdict } from "../guard/jevGuard";
import { AGENT_LIMITS, HISTORY_TURNS } from "./config";
import type { AgentContext } from "./context";
import type { AgentModel } from "./model";
import { runAgent, type AgentCallbacks, type AgentResult } from "./runAgent";
import { hubLabel } from "./tools/shared";
import { NO_USAGE } from "./usage";

/** A chat message from the user. */
export interface QuestionInput {
  /** Existing session id from the browser, or null to start a new conversation. */
  sessionId: string | null;
  /** The question as typed. */
  message: string;
  /** Unit system for the answer (the app always sends "us", D126). */
  units: UnitSystem;
}

/** Everything answerQuestion needs (injectable for tests). */
export interface AnswerQuestionDeps {
  /** The answering model. */
  agentModel: AgentModel;
  /** Hubs, latest scores and data access for one request. */
  loadContext: (options: { today: string; units: UnitSystem }) => Promise<AgentContext>;
  /** Returns the session id, creating a session when the browser has none. */
  ensureSession: (sessionId: string | null) => Promise<string>;
  /** The last `turns` turns of the conversation. */
  loadHistory: (sessionId: string, turns: number) => Promise<ModelMessage[]>;
  /** Stores the turn's messages and the checked answer. */
  saveTurn: (sessionId: string, messages: ModelMessage[], answer: FinalAnswer, model: string) => Promise<void>;
  /** Writes to the events log (never throws). */
  recordEvent: (event: NewEvent) => Promise<boolean>;
  /** The out-of-scope guard (D118). Must not throw: it fails open itself. */
  guard: (input: GuardInput) => Promise<GuardVerdict>;
  /** Today `YYYY-MM-DD` (UTC). */
  today: () => string;
  /**
   * The answer cache for FIRST questions (D136). Leave it out to skip caching (tests, evals, and
   * the eval script's operator requests, which must always run the agent).
   */
  answerCache?: AnswerCacheStore;
}

/** The result returned to the caller. */
export interface QuestionResult {
  /** The conversation's id (new or existing). */
  sessionId: string;
  /** The checked answer. */
  answer: FinalAnswer;
  /** Tokens and cost (all 0 when the guard declined or the answer came from the cache). */
  usage: AgentResult["usage"];
  /** True when the answer was reused from the answer cache. */
  fromCache: boolean;
}

/**
 * Answers one chat message end to end.
 * @param input - session, message and unit system.
 * @param deps - model, data access and logging.
 * @param callbacks - live progress hooks, plus `onSession` (called as soon as the session id is known).
 * @returns the session id, the checked answer and token usage.
 * @throws AgentInputError (logged as `agent.rejected_input`) / BoundaryError (logged as `agent.failed`).
 */
export async function answerQuestion(
  input: QuestionInput,
  deps: AnswerQuestionDeps,
  callbacks: AgentCallbacks & { onSession?: (sessionId: string) => void } = {},
): Promise<QuestionResult> {
  const correlationId = randomUUID();
  let sessionId: string | undefined;
  /**
   * Saves the turn. A failure here must not cost the user an answer that's already checked:
   * it's logged and recorded, and the answer is still returned.
   */
  const save = async (id: string, messages: ModelMessage[], answer: FinalAnswer, model: string) => {
    try {
      await deps.saveTurn(id, messages, answer, model);
    } catch (error) {
      console.error(boundaryLogLine(error, "answerQuestion", "database"));
      await deps.recordEvent({ eventType: "chat.save_failed", source: "agent", level: "error", correlationId, sessionId: id, message: describeUnknownError(error) });
    }
  };
  try {
    sessionId = await deps.ensureSession(input.sessionId);
    callbacks.onSession?.(sessionId);
    const [context, history] = await Promise.all([
      deps.loadContext({ today: deps.today(), units: input.units }),
      deps.loadHistory(sessionId, HISTORY_TURNS),
    ]);

    // The guard (D118) runs before the paid agent. Empty or over-long messages skip it:
    // runAgent rejects those with its own friendly message.
    const message = input.message.trim();
    const validMessage = message.length > 0 && message.length <= AGENT_LIMITS.maxUserMessageChars;

    // Answer cache (D136): only the first question of a conversation, checked BEFORE the guard so a
    // hit costs nothing at all. It was answered (and passed the guard) the first time it was asked.
    const today = deps.today();
    const cacheKey =
      validMessage && history.length === 0 && deps.answerCache
        ? answerCacheKey({ question: normalizeQuestion(message), scoresVersion: scoresVersionOf(context.snapshotByHub.values()), model: deps.agentModel.modelId, today })
        : null;
    if (cacheKey && deps.answerCache) {
      const cached = await deps.answerCache.get(cacheKey, new Date()).catch((error: unknown) => {
        console.error(`${boundaryLogLine(error, "answerQuestion", "database")} (answer cache read failed; answering normally)`);
        return null;
      });
      if (cached) {
        callbacks.onAnswerDelta?.(cached.answer.answer);
        // The turn keeps the cached tool results (for follow-ups), with the question as THIS user typed it.
        const messages = cached.messages.map((m, i) => (i === 0 && m.role === "user" ? { ...m, content: message } : m));
        await save(sessionId, messages, cached.answer, cached.answer.meta.model);
        await deps.recordEvent({
          eventType: "agent.answered",
          source: "agent",
          level: "info",
          correlationId,
          sessionId,
          message: "answered from the answer cache",
          payload: { model: cached.answer.meta.model, fromCache: true, ...NO_USAGE },
        });
        return { sessionId, answer: cached.answer, usage: NO_USAGE, fromCache: true };
      }
    }

    if (validMessage) {
      const verdict = await deps.guard({
        message,
        history: recentTurnsFromHistory(history),
        hubNames: context.hubs.map(hubLabel),
      });
      await deps.recordEvent({
        eventType: "guard.decision",
        source: "guard",
        level: verdict.decision === "decline" || verdict.failedOpen ? "warn" : "info",
        correlationId,
        sessionId,
        message: verdict.failedOpen ? `failed open: ${verdict.error}` : `${verdict.decision}${verdict.reason ? ` (${verdict.reason})` : ""}`,
        payload: {
          decision: verdict.decision,
          reason: verdict.reason,
          mode: verdict.mode,
          inScope: verdict.scores?.inScope ?? null,
          manipulation: verdict.scores?.manipulation ?? null,
          failedOpen: verdict.failedOpen,
          ms: verdict.ms,
          model: verdict.model,
          costUsd: verdict.costUsd ?? null,
        },
      });
      if (verdict.decision === "decline" && verdict.reason) {
        const answer = guardDeclineAnswer(verdict.reason, context.hubs.length);
        await save(sessionId, [{ role: "user", content: message }, { role: "assistant", content: answer.answer }], answer, verdict.model);
        return { sessionId, answer, usage: NO_USAGE, fromCache: false };
      }
    }

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
    await save(sessionId, result.newMessages, result.answer, deps.agentModel.modelId);
    // Cache only clean answers: a first question with no validation warnings (D136).
    if (cacheKey && deps.answerCache && result.answer.meta.warnings.length === 0) {
      await deps.answerCache
        .put({
          key: cacheKey,
          question: normalizeQuestion(message),
          scoresVersion: scoresVersionOf(context.snapshotByHub.values()),
          model: deps.agentModel.modelId,
          answer: result.answer,
          messages: result.newMessages,
          expiresAt: cacheExpiry(new Date()),
        })
        .catch((error: unknown) => console.error(`${boundaryLogLine(error, "answerQuestion", "database")} (answer cache write failed; the answer is unaffected)`));
    }
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
        fromCache: false,
        // Cost tracking (D136): cached input tokens show the provider's prompt cache working.
        inputTokens: result.usage.inputTokens,
        cachedInputTokens: result.usage.cachedInputTokens,
        cacheWriteTokens: result.usage.cacheWriteTokens,
        outputTokens: result.usage.outputTokens,
        costUsd: result.usage.costUsd,
      },
    });
    return { sessionId, answer: result.answer, usage: result.usage, fromCache: false };
  } catch (error) {
    // An empty or too-long message is the user's input, not a failure of ours.
    const rejected = error instanceof AgentInputError;
    await deps.recordEvent({
      eventType: rejected ? "agent.rejected_input" : "agent.failed",
      source: "agent",
      level: rejected ? "warn" : "error",
      correlationId,
      sessionId,
      message: describeUnknownError(error),
      payload: { model: deps.agentModel.modelId },
    });
    throw error;
  }
}
