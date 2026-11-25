import type { ModelMessage } from "ai";
import { describe, expect, it, vi } from "vitest";
import { RETRY_FEEDBACK_PREFIX } from "../agent/config";
import {
  GUARD_CONFIG,
  GUARD_QUESTIONS,
  buildDecisionRequest,
  createGuard,
  decideFromScores,
  guardDeclineAnswer,
  recentTurnsFromHistory,
  runGuard,
} from "./jevGuard";

const hubNames = ["Dallas, TX", "Denver, CO"];
const turn = { question: "Why is Dallas high?", answer: "Dallas is High at 72.4." };

/** A fake fetch returning a decisions response. */
const jevReplies = (answers: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(answers), { status, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;

describe("buildDecisionRequest", () => {
  it("asks the first-message questions with our hub list", () => {
    const body = buildDecisionRequest({ message: "Why is Dallas high?", history: [], hubNames }, "typesafe/jev-1.14-20261014");
    expect(body).toMatchObject({ model: "typesafe/jev-1.14-20261014", state: { message: "Why is Dallas high?", ourHubs: "Dallas, TX; Denver, CO" } });
    expect(body.questions).toBe(GUARD_QUESTIONS.first);
    expect((body.state as Record<string, unknown>).previousTurns).toBeUndefined();
  });

  it("gives a follow-up the last turns and the in-context questions", () => {
    const history = [turn, turn, { question: "Why that one?", answer: "Because…" }];
    const body = buildDecisionRequest({ message: "And Denver?", history, hubNames }, "m");
    expect(body.questions).toBe(GUARD_QUESTIONS.followUp);
    expect((body.state as { previousTurns: unknown[] }).previousTurns).toHaveLength(GUARD_CONFIG.historyTurns);
  });
});

describe("decideFromScores", () => {
  it("allows on-topic messages and declines off-topic or manipulative ones (manipulation named first)", () => {
    expect(decideFromScores({ inScope: 0.24, manipulation: 0.38 })).toEqual({ decision: "allow", reason: null });
    expect(decideFromScores({ inScope: 0.01, manipulation: 0.03 })).toEqual({ decision: "decline", reason: "off_topic" });
    expect(decideFromScores({ inScope: 0.94, manipulation: 0.98 })).toEqual({ decision: "decline", reason: "manipulation" });
  });
});

describe("recentTurnsFromHistory", () => {
  it("pairs questions with answer text (structured JSON or plain), skipping retry feedback and tool messages", () => {
    const history = [
      { role: "user", content: "Why is Dallas high?" },
      { role: "assistant", content: [{ type: "tool-call", toolCallId: "c1", toolName: "explain_hub_score", input: {} }] },
      { role: "tool", content: [] },
      { role: "assistant", content: [{ type: "text", text: JSON.stringify({ answer: "Dallas is High at 72.4." }) }] },
      { role: "user", content: `${RETRY_FEEDBACK_PREFIX} - fix it` },
      { role: "user", content: "What is the capital of France?" },
      { role: "assistant", content: "I can only help with weather risk for our 36 hubs." },
    ] as unknown as ModelMessage[];
    expect(recentTurnsFromHistory(history)).toEqual([
      { question: "Why is Dallas high?", answer: "Dallas is High at 72.4." },
      { question: "What is the capital of France?", answer: "I can only help with weather risk for our 36 hubs." },
    ]);
  });
});

describe("runGuard", () => {
  const deps = (fetchImpl: typeof fetch) => ({ apiKey: "k".repeat(30), model: "typesafe/jev-1.14-20261014", fetch: fetchImpl });

  it("decides from Jev's probabilities", async () => {
    const fetchImpl = jevReplies({ answers: { inScope: { type: "noul", noul: 0.01 }, manipulation: { type: "noul", noul: 0.03 } } });
    const verdict = await runGuard({ message: "What is the capital of France?", history: [], hubNames }, deps(fetchImpl));
    expect(verdict).toMatchObject({ decision: "decline", reason: "off_topic", mode: "first", failedOpen: false, scores: { inScope: 0.01, manipulation: 0.03 } });
  });

  it("fails open, with a 🐍 log line, when Jev errors or returns no probabilities", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const fetchImpl of [jevReplies({ error: { message: "upstream down" } }, 502), jevReplies({ answers: {} }), vi.fn(async () => Promise.reject(new DOMException("timeout", "TimeoutError"))) as unknown as typeof fetch]) {
      const verdict = await runGuard({ message: "Why is Dallas high?", history: [turn], hubNames }, deps(fetchImpl));
      expect(verdict).toMatchObject({ decision: "allow", failedOpen: true, mode: "follow_up", scores: null });
    }
    expect(log.mock.calls.every(([line]) => /GuardUnavailableError \|\| .* \|\| runGuard \|\| 🐍/.test(line))).toBe(true);
    log.mockRestore();
  });
});

describe("createGuard", () => {
  it("fails open (logged) when JEV_MODEL isn't configured, instead of breaking the chat", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const guard = createGuard({ OPENROUTER_API_KEY: "k".repeat(30) });
    expect(await guard({ message: "hi", history: [], hubNames })).toMatchObject({ decision: "allow", failedOpen: true, model: "not-configured" });
    expect(log.mock.calls[0][0]).toMatch(/GuardNotConfiguredError \|\| .*JEV_MODEL.* \|\| createGuard \|\| 🦔/);
    log.mockRestore();
  });
});

describe("guardDeclineAnswer", () => {
  it("is a friendly out-of-scope answer with example chips and no data", () => {
    const off = guardDeclineAnswer("off_topic", 36);
    expect(off).toMatchObject({ outOfScope: true, confidence: null, dataUsed: [], recommendation: null });
    expect(off.answer).toContain("36 hubs");
    expect(off.followUpSuggestions).toHaveLength(3);
    expect(guardDeclineAnswer("manipulation", 36).answer).toContain("can't change how I work");
  });
});
