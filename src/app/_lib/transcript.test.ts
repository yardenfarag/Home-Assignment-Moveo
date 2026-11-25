import { describe, expect, it } from "vitest";
import type { FinalAnswer } from "@/core/agent/answerSchema";
import type { SneakoscopeUIMessage } from "@/core/api/chatStream";
import type { TranscriptTurn } from "@/core/db/chatTranscript";
import { activityKey, messagesFromTurns, textOf } from "./transcript";

const answer = (text: string) => ({ answer: text }) as unknown as FinalAnswer;

describe("messagesFromTurns", () => {
  it("rebuilds a question and its validated answer per turn, in order, with stable ids", () => {
    const turns = [
      { question: "Riskiest hub?", answer: answer("Miami.") },
      { question: "Why?", answer: answer("Hurricanes.") },
    ] as TranscriptTurn[];
    const messages = messagesFromTurns(turns);
    expect(messages.map((m) => [m.id, m.role])).toEqual([
      ["history-user-0", "user"],
      ["history-answer-0", "assistant"],
      ["history-user-1", "user"],
      ["history-answer-1", "assistant"],
    ]);
    expect(textOf(messages[2])).toBe("Why?");
    expect(messages[3].parts).toEqual([{ type: "data-answer", id: "answer", data: turns[1].answer }]);
  });

  it("gives no messages for an empty chat", () => {
    expect(messagesFromTurns([])).toEqual([]);
  });
});

describe("activityKey (stall watchdog)", () => {
  const streaming = (parts: SneakoscopeUIMessage["parts"]): SneakoscopeUIMessage[] => [
    { id: "q", role: "user", parts: [{ type: "text", text: "Hi" }] },
    { id: "a", role: "assistant", parts },
  ];

  it("changes when text grows or a progress step finishes, not otherwise", () => {
    const running = streaming([{ type: "data-progress", id: "p1", data: { tool: "rank_hubs", label: "Ranking…", status: "running" } }]);
    const done = streaming([{ type: "data-progress", id: "p1", data: { tool: "rank_hubs", label: "Ranking…", status: "done" } }]);
    const withText = streaming([...done[1].parts, { type: "text", text: "Mia" }]);
    const moreText = streaming([...done[1].parts, { type: "text", text: "Miami" }]);
    expect(activityKey(running)).toBe(activityKey(streaming([...running[1].parts])));
    expect(new Set([activityKey(running), activityKey(done), activityKey(withText), activityKey(moreText)]).size).toBe(4);
  });

  it("works with no messages", () => {
    expect(activityKey([])).toBe("0");
  });
});
