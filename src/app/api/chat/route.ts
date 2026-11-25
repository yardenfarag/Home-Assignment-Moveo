/**
 * POST /api/chat — the agent's API (requirement 6). The UI calls this, never the LLM.
 * Body: { sessionId: uuid | null, message: string }. Answers use US units (D126).
 * Streams the AI SDK chat protocol: session, progress, answer text, validated answer (A1).
 * Rate-limited per visitor and per day before the agent runs (D114).
 */
import { createUIMessageStreamResponse } from "ai";
import { answerQuestion } from "@/core/agent/answerQuestion";
import { createAnswerQuestionDeps } from "@/core/agent/createAnswerQuestionDeps";
import { checkChatGate } from "@/core/api/chatGate";
import { buildChatStream, chatRequestSchema } from "@/core/api/chatStream";
import { getCronEnv } from "@/core/config/env";
import { countEvents, recordEvent } from "@/core/db/eventsRepository";
import { userError } from "@/core/errors/userErrors";
import { errorResponse, failure } from "../_lib/http";

/**
 * Upper bound for one request. The agent's whole turn is capped at `AGENT_TIMEOUTS.turnMs` (100 s,
 * both attempts); the rest covers the guard, database reads and saving the turn. (Must be a literal.)
 */
export const maxDuration = 150;

/**
 * Answers one chat message as a stream.
 * @param request - the HTTP request.
 * @returns the streaming response, or a friendly JSON error before streaming starts.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const raw: unknown = await request.json().catch(() => undefined);
    if (raw === undefined) return errorResponse(userError("invalid_request")); // not JSON: the caller's mistake, not a 500
    const body = chatRequestSchema.parse(raw);
    const limited = await checkChatGate(request.headers, {
      countEvents,
      recordEvent,
      secret: getCronEnv().CRON_SECRET,
      now: () => new Date(),
    });
    if (limited) return errorResponse(limited);
    const deps = createAnswerQuestionDeps();
    const stream = buildChatStream(body, (req, callbacks) => answerQuestion({ ...req, units: "us" }, deps, callbacks));
    return createUIMessageStreamResponse({ stream, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error, "POST /api/chat");
  }
}
