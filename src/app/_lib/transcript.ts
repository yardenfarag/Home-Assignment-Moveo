/**
 * @module app/_lib/transcript
 *
 * Converting between chat messages and saved transcripts (pure, tested).
 */
import type { SneakoscopeUIMessage } from "@/core/api/chatStream";
import type { TranscriptTurn } from "@/core/db/chatTranscript";

/**
 * Text of a message (its text parts joined).
 * @param message - a chat message, or undefined.
 * @returns the text ("" when there's none).
 */
export function textOf(message: SneakoscopeUIMessage | undefined): string {
  return message?.parts.map((part) => (part.type === "text" ? part.text : "")).join("") ?? "";
}

/**
 * A short fingerprint of the newest message that changes whenever anything new arrives
 * (a part, more text, a progress step finishing). The stall watchdog restarts on each change.
 * @param messages - the chat messages.
 * @returns the fingerprint.
 */
export function activityKey(messages: SneakoscopeUIMessage[]): string {
  const last = messages.at(-1);
  if (!last) return "0";
  const parts = last.parts.map((part) => (part.type === "text" ? `t${part.text.length}` : part.type === "data-progress" ? `p${part.data.status}` : part.type));
  return `${messages.length}:${last.id}:${parts.join(",")}`;
}

/**
 * Rebuilds UI messages from a saved transcript (validated answers, as they were shown).
 * @param turns - the saved turns, oldest first.
 * @returns a user message and an answer message per turn.
 */
export function messagesFromTurns(turns: TranscriptTurn[]): SneakoscopeUIMessage[] {
  return turns.flatMap((turn, index) => [
    { id: `history-user-${index}`, role: "user" as const, parts: [{ type: "text" as const, text: turn.question }] },
    {
      id: `history-answer-${index}`,
      role: "assistant" as const,
      parts: [{ type: "data-answer" as const, id: "answer", data: turn.answer }],
    },
  ]);
}
