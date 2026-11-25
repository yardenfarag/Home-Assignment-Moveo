import { describe, expect, it } from "vitest";
import type { FinalAnswer } from "../agent/answerSchema";
import { RETRY_FEEDBACK_PREFIX } from "../agent/config";
import { turnsFromRows } from "./chatTranscript";
import type { Json } from "./database.types";

const answer = (text: string) => ({ answer: text }) as FinalAnswer;
const stored = (text: string) => answer(text) as unknown as Json;

describe("turnsFromRows", () => {
  it("pairs each question with its validated answer and hides retry feedback", () => {
    const rows = [
      { role: "user", content: { role: "user", content: "Why is Dallas high?" }, answer: null, created_at: "t1" },
      { role: "assistant", content: { role: "assistant", content: [] }, answer: null, created_at: "t2" },
      { role: "tool", content: { role: "tool", content: [] }, answer: null, created_at: "t3" },
      { role: "user", content: { role: "user", content: `${RETRY_FEEDBACK_PREFIX}\n- bad` }, answer: null, created_at: "t4" },
      { role: "assistant", content: { role: "assistant", content: "{}" }, answer: stored("Dallas is High."), created_at: "t5" },
      { role: "user", content: { role: "user", content: "And Miami?" }, answer: null, created_at: "t6" },
      { role: "assistant", content: { role: "assistant", content: "{}" }, answer: stored("Miami is High."), created_at: "t7" },
    ];
    expect(turnsFromRows(rows)).toEqual([
      { question: "Why is Dallas high?", answer: answer("Dallas is High."), askedAt: "t1" },
      { question: "And Miami?", answer: answer("Miami is High."), askedAt: "t6" },
    ]);
  });

  it("drops a question whose answer never arrived (e.g. the turn failed)", () => {
    const rows = [{ role: "user", content: { role: "user", content: "Lost question" }, answer: null, created_at: "t1" }];
    expect(turnsFromRows(rows)).toEqual([]);
  });
});
