/**
 * POST /api/chat — the agent's API (requirement 6). The UI calls this, never the LLM.
 * Body: { sessionId: uuid | null, message: string, units: "us" | "metric" }.
 * Streams the AI SDK chat protocol: session, progress, answer text, validated answer (A1).
 */
import { createUIMessageStreamResponse } from "ai";
import { answerQuestion } from "@/core/agent/answerQuestion";
import { createAnswerQuestionDeps } from "@/core/agent/createAnswerQuestionDeps";
import { buildChatStream, chatRequestSchema } from "@/core/api/chatStream";
import { failure } from "../_lib/http";

/** Upper bound for one turn (the agent's own total timeout is 60 s; a validation retry may follow). */
export const maxDuration = 120;

/**
 * Answers one chat message as a stream.
 * @param request - the HTTP request.
 * @returns the streaming response, or a friendly JSON error before streaming starts.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = chatRequestSchema.parse(await request.json());
    const deps = createAnswerQuestionDeps();
    const stream = buildChatStream(body, (req, callbacks) => answerQuestion(req, deps, callbacks));
    return createUIMessageStreamResponse({ stream, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error, "POST /api/chat");
  }
}
