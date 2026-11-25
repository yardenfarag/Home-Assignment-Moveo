/**
 * @module evals/lib/runners
 *
 * Two ways to run a case (E1):
 * - in-process: the real agent + real data, history kept in memory, NOTHING saved
 *   (eval runs must not fill anyone's chat list);
 * - remote: POST to a deployed /api/chat and read the stream like the browser does.
 */
import type { ModelMessage } from "ai";
import type { FinalAnswer } from "../../src/core/agent/answerSchema";
import type { AgentContext } from "../../src/core/agent/context";
import { runAgent } from "../../src/core/agent/runAgent";
import { OPERATOR_HEADER } from "../../src/core/api/chatGate";
import { describeUnknownError } from "../../src/core/errors/boundaryError";
import type { AgentModel } from "../../src/core/agent/model";
import type { EvalCase, TurnResult } from "./types";

/**
 * Runs a case's turns through the agent in this process (follow-ups see the earlier turns).
 * A failed turn is recorded with its error and the next turn still runs.
 * @param evalCase - the case.
 * @param agent - the answering model.
 * @param context - the data the agent reads.
 * @returns one result per turn, with token usage.
 */
export async function runInProcess(evalCase: EvalCase, agent: AgentModel, context: AgentContext): Promise<TurnResult[]> {
  const history: ModelMessage[] = [];
  const results: TurnResult[] = [];
  for (const question of evalCase.turns) {
    const started = Date.now();
    try {
      const run = await runAgent({ message: question, history }, { model: agent.model, modelId: agent.modelId, context });
      history.push(...run.newMessages);
      results.push({ question, answer: run.answer, ms: Date.now() - started, usage: run.usage });
    } catch (error) {
      results.push({ question, answer: null, error: describeUnknownError(error), ms: Date.now() - started });
    }
  }
  return results;
}

/** Connection details for a deployed app. */
export interface RemoteTarget {
  baseUrl: string;
  /** The cron secret, sent as the operator key so the rate limits don't throttle the eval (D114). */
  operatorKey: string;
}

/**
 * Runs a case's turns against a deployed /api/chat (follow-ups reuse the session id).
 * @param evalCase - the case.
 * @param target - the deployment's URL and the operator key.
 * @returns one result per turn (no token usage — the stream doesn't carry it).
 */
export async function runRemote(evalCase: EvalCase, target: RemoteTarget): Promise<TurnResult[]> {
  let sessionId: string | null = null;
  const results: TurnResult[] = [];
  for (const question of evalCase.turns) {
    const started = Date.now();
    let answer: FinalAnswer | null = null;
    let error: string | undefined;
    try {
      const res = await fetch(new URL("/api/chat", target.baseUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json", [OPERATOR_HEADER]: target.operatorKey },
        body: JSON.stringify({ sessionId, message: question }),
        signal: AbortSignal.timeout(180_000),
      });
      const body = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      for (const line of body.split("\n")) {
        if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
        const chunk = JSON.parse(line.slice(6)) as { type: string; data?: unknown };
        if (chunk.type === "data-session") sessionId = (chunk.data as { sessionId: string }).sessionId;
        if (chunk.type === "data-answer") answer = chunk.data as FinalAnswer;
        if (chunk.type === "data-error") error = (chunk.data as { message: string }).message;
      }
      if (!answer && !error) error = "stream ended without an answer";
    } catch (caught) {
      error = describeUnknownError(caught);
    }
    results.push({ question, answer, error, ms: Date.now() - started });
  }
  return results;
}
