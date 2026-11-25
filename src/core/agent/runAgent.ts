/**
 * @module core/agent/runAgent
 *
 * One agent turn: the model picks tools, the tools compute everything, the
 * model writes a structured answer, and CODE checks and completes it.
 *
 *   streamText(tools + Output.object(llmAnswerSchema))
 *     → stream answer text as it's written (onAnswerDelta)
 *     → finalizeAnswer (numbers/hubs trace to tools; code sets confidence,
 *       premise verdict, caveats, disclaimer)
 *     → invalid? send the problems back and retry ONCE → still invalid? clear error.
 */
import {
  isStepCount,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  streamText,
  type LanguageModel,
  type ModelMessage,
} from "ai";
import { AGENT_TIMEOUTS } from "../config/timeouts";
import { AgentInputError } from "../errors/agentInputError";
import { BoundaryError, describeUnknownError } from "../errors/boundaryError";
import { buildSystemPrompt } from "./systemPrompt";
import { llmAnswerSchema, type FinalAnswer, type LlmAnswer } from "./answerSchema";
import { AGENT_LIMITS, RETRY_FEEDBACK_PREFIX } from "./config";
import type { AgentContext } from "./context";
import { finalizeAnswer } from "./finalizeAnswer";
import { ToolLedger } from "./ledger";
import { buildTools } from "./tools";
import type { ToolCallbacks } from "./tools/shared";

/** Re-exported so callers can tell bad input from a failed turn without importing the errors folder. */
export { AgentInputError };

/** The user's question plus the conversation so far. */
export interface AgentRequest {
  message: string;
  /** Earlier turns (already trimmed to the history window, G7). */
  history: ModelMessage[];
}

/** What the agent needs to run. */
export interface AgentDeps {
  /** The answering model. */
  model: LanguageModel;
  /** Its OpenRouter id (recorded on the answer). */
  modelId: string;
  /** Hubs, latest scores and data access for this request. */
  context: AgentContext;
}

/** Live progress hooks (the API streams these to the browser). */
export interface AgentCallbacks extends ToolCallbacks {
  /** New characters of the answer text as the model writes it. */
  onAnswerDelta?: (delta: string) => void;
  /**
   * The answer text started over (the model began a new step, or the stream was retried):
   * the text sent so far is replaced by what follows.
   */
  onAnswerRestart?: () => void;
  /** The first answer failed validation; a retry is starting. */
  onRetry?: (problems: string[]) => void;
}

/** Result of one turn. */
export interface AgentResult {
  answer: FinalAnswer;
  /** Messages to append to the conversation history (user message, tool calls/results, answers). */
  newMessages: ModelMessage[];
  usage: { inputTokens: number; outputTokens: number };
}


/**
 * Runs one model attempt and streams the answer text.
 * @param messages - history plus this turn's messages so far.
 * @param system - the system prompt.
 * @param deps - model and context.
 * @param tools - the tools for this request.
 * @param callbacks - progress hooks.
 * @param deadline - aborts when the whole turn runs out of time.
 * @returns the raw structured answer (or the reason it's missing) and the response messages.
 */
async function attempt(
  messages: ModelMessage[],
  system: string,
  deps: AgentDeps,
  tools: ReturnType<typeof buildTools>,
  callbacks: AgentCallbacks,
  deadline: AbortSignal,
): Promise<{ raw: LlmAnswer | null; problem: string | null; responseMessages: ModelMessage[]; usage: AgentResult["usage"] }> {
  let streamError: unknown = null;
  const result = streamText({
    model: deps.model,
    system,
    messages,
    tools,
    output: Output.object({ schema: llmAnswerSchema }),
    stopWhen: isStepCount(AGENT_LIMITS.maxToolSteps + 1),
    timeout: { totalMs: AGENT_TIMEOUTS.attemptMs, stepMs: AGENT_TIMEOUTS.stepMs, toolMs: AGENT_TIMEOUTS.toolMs },
    abortSignal: deadline,
    maxOutputTokens: AGENT_LIMITS.maxOutputTokens,
    maxRetries: 1,
    onError: ({ error }) => {
      streamError = error;
    },
  });

  /**
   * Wraps a failed model call (timeout, network, provider error) in the 🦉 boundary format.
   * A step timeout makes the partial-output stream itself throw (D108), so the loop below is guarded too.
   */
  const callFailed = (cause: unknown) =>
    new BoundaryError({
      name: "LlmCallError",
      message: `The model call failed: ${describeUnknownError(cause)}`,
      functionName: "runAgent",
      boundary: "llm",
      cause,
    });

  // The SDK restarts its partial output at every new step and stream retry, so the text can start
  // over. When it no longer continues what was sent, tell the caller and send it from the start.
  let sent = "";
  try {
    for await (const partial of result.partialOutputStream) {
      const text = (partial as Partial<LlmAnswer> | undefined)?.answer;
      if (typeof text !== "string") continue;
      if (!text.startsWith(sent)) {
        callbacks.onAnswerRestart?.();
        sent = "";
      }
      if (text.length > sent.length) {
        callbacks.onAnswerDelta?.(text.slice(sent.length));
        sent = text;
      }
    }
  } catch (error) {
    throw callFailed(streamError ?? error);
  }

  let raw: LlmAnswer | null = null;
  let problem: string | null = null;
  try {
    raw = await result.output;
  } catch (error) {
    if (streamError) throw callFailed(streamError);
    if (NoObjectGeneratedError.isInstance(error) || NoOutputGeneratedError.isInstance(error)) {
      problem = `Your final answer did not match the required JSON schema (${describeUnknownError(error)}).`;
    } else throw callFailed(error);
  }
  const usage = await result.totalUsage;
  return {
    raw,
    problem,
    responseMessages: (await result.responseMessages) as ModelMessage[],
    usage: { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 },
  };
}

/**
 * Answers one question.
 * @param request - the message and history.
 * @param deps - model and per-request context.
 * @param callbacks - progress hooks.
 * @returns the checked answer, the new history messages and token usage.
 * @throws AgentInputError for an invalid question; BoundaryError (llm) when the model fails or keeps producing invalid answers.
 */
export async function runAgent(request: AgentRequest, deps: AgentDeps, callbacks: AgentCallbacks = {}): Promise<AgentResult> {
  const message = request.message.trim();
  if (message.length === 0) throw new AgentInputError("Please type a question first — for example: “Why is the Dallas hub risky?”");
  if (message.length > AGENT_LIMITS.maxUserMessageChars) {
    throw new AgentInputError(`That message is too long for me — please keep it under ${AGENT_LIMITS.maxUserMessageChars.toLocaleString("en-US")} characters.`);
  }

  const ledger = new ToolLedger(deps.context.units);
  ledger.seedFromHistory(request.history);
  // Facts the system prompt states, so they're known even though no tool returned them: the hub count
  // ("36 hubs") and this year and last year ("Today is …"), which rule 14 asks the agent to name (D122).
  const year = Number(deps.context.today.slice(0, 4));
  ledger.addKnownNumbers([deps.context.hubs.length, year, year - 1]);
  const tools = buildTools(deps.context, { ledger, callbacks });
  const system = buildSystemPrompt(deps.context);
  const newMessages: ModelMessage[] = [{ role: "user", content: message }];
  const deadline = AbortSignal.timeout(AGENT_TIMEOUTS.turnMs); // one budget for both attempts
  const usage = { inputTokens: 0, outputTokens: 0 };
  let problems: string[] = [];

  for (let attemptNo = 0; attemptNo <= AGENT_LIMITS.validationRetries; attemptNo++) {
    const run = await attempt([...request.history, ...newMessages], system, deps, tools, callbacks, deadline);
    newMessages.push(...run.responseMessages);
    usage.inputTokens += run.usage.inputTokens;
    usage.outputTokens += run.usage.outputTokens;

    if (run.raw) {
      const final = finalizeAnswer(run.raw, {
        ledger,
        levelsByHub: deps.context.levelsByHub,
        model: deps.modelId,
        retried: attemptNo > 0,
      });
      if (final.ok) return { answer: final.answer, newMessages, usage };
      problems = final.problems;
    } else {
      problems = [run.problem ?? "No answer was produced."];
    }

    if (attemptNo < AGENT_LIMITS.validationRetries) {
      callbacks.onRetry?.(problems);
      newMessages.push({
        role: "user",
        content: `${RETRY_FEEDBACK_PREFIX}\n- ${problems.join("\n- ")}\nFix these and answer again. Use the tool results you already have; only call a tool if you truly need data you don't have yet.`,
      });
    }
  }

  throw new BoundaryError({
    name: "AgentAnswerValidationError",
    message: `The answer failed validation ${AGENT_LIMITS.validationRetries + 1} times: ${problems.join(" | ")}`,
    functionName: "runAgent",
    boundary: "llm",
  });
}
