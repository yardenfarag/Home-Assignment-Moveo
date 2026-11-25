/**
 * @module core/api/chatStream
 *
 * Turns one agent turn into the AI SDK chat stream the browser reads (A1):
 *   data-session → data-progress (per tool, updated in place) → answer text
 *   → [data-retry → answer text again] → data-answer (validated) | data-error
 * Framework-free: the Next.js route only wraps it in a Response.
 */
import { createUIMessageStream, type UIMessage } from "ai";
import { z } from "zod";
import type { QuestionResult } from "../agent/answerQuestion";
import type { FinalAnswer } from "../agent/answerSchema";
import type { AgentCallbacks } from "../agent/runAgent";
import { describeUnknownError, formatBoundaryMessage } from "../errors/boundaryError";
import { toUserError, type UserError } from "../errors/userErrors";
import { progressLabel } from "./progressLabels";

/** Body of `POST /api/chat`. */
export const chatRequestSchema = z.object({
  sessionId: z.uuid().nullable(),
  /** Hard cap on the raw body; the agent's friendlier 1,000-character limit applies after this. */
  message: z.string().max(10_000),
});

/** A validated chat request. */
export type ChatRequest = z.infer<typeof chatRequestSchema>;

/** The custom data parts our stream carries (typed for the UI in Step 6). */
export type SneakoscopeDataParts = {
  session: { sessionId: string };
  progress: { tool: string; label: string; status: "running" | "done" | "failed" };
  retry: { message: string };
  answer: FinalAnswer;
  error: Omit<UserError, "status">;
};

/** The chat message type shared by server and UI. */
export type SneakoscopeUIMessage = UIMessage<never, SneakoscopeDataParts>;

/** Runs one turn (answerQuestion with real or fake deps). */
export type TurnRunner = (
  request: ChatRequest,
  callbacks: AgentCallbacks & { onSession?: (sessionId: string) => void },
) => Promise<QuestionResult>;

/** Shown while the answer is being re-checked after a failed validation. */
const RETRY_MESSAGE = "Double-checking my numbers against the data…";

/**
 * Builds the streaming response body for one chat turn.
 * @param request - the validated request.
 * @param run - runs the turn and reports progress through callbacks.
 * @returns a stream of UI message chunks.
 */
export function buildChatStream(request: ChatRequest, run: TurnRunner) {
  return createUIMessageStream<SneakoscopeUIMessage>({
    execute: async ({ writer }) => {
      writer.write({ type: "start" });
      const pending = new Map<string, { id: string; label: string }[]>(); // tool name → running calls (FIFO)
      let callCount = 0;
      let textId: string | null = null;
      let attempt = 0;

      const endText = () => {
        if (textId) writer.write({ type: "text-end", id: textId });
        textId = null;
      };

      try {
        const result = await run(request, {
          onSession: (sessionId) => writer.write({ type: "data-session", id: "session", data: { sessionId } }),
          onToolStart: (tool, input) => {
            const call = { id: `progress-${++callCount}`, label: progressLabel(tool, input) };
            pending.set(tool, [...(pending.get(tool) ?? []), call]);
            writer.write({ type: "data-progress", id: call.id, data: { tool, label: call.label, status: "running" } });
          },
          onToolEnd: (tool, output) => {
            const call = pending.get(tool)?.shift();
            if (!call) return;
            const failed = !!output && typeof output === "object" && "error" in output;
            writer.write({ type: "data-progress", id: call.id, data: { tool, label: call.label, status: failed ? "failed" : "done" } });
          },
          onAnswerDelta: (delta) => {
            if (!textId) {
              textId = `answer-${attempt}`;
              writer.write({ type: "text-start", id: textId });
            }
            writer.write({ type: "text-delta", id: textId, delta });
          },
          onRetry: () => {
            endText();
            attempt++;
            writer.write({ type: "data-retry", id: `retry-${attempt}`, data: { message: RETRY_MESSAGE } });
          },
        });
        endText();
        writer.write({ type: "data-answer", id: "answer", data: result.answer });
      } catch (error) {
        endText();
        console.error(
          formatBoundaryMessage({
            name: error instanceof Error ? error.name : "UnknownError",
            message: describeUnknownError(error),
            functionName: "buildChatStream",
            boundary: "apiRoute",
          }),
        );
        const { code, message, hint, retryable } = toUserError(error);
        writer.write({ type: "data-error", id: "error", data: { code, message, hint, retryable } });
      }
      writer.write({ type: "finish" });
    },
    onError: (error) => toUserError(error).message,
  });
}
