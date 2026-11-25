import { NO_USAGE } from "../agent/usage";
import { describe, expect, it } from "vitest";
import type { FinalAnswer } from "../agent/answerSchema";
import { AgentInputError } from "../errors/agentInputError";
import { buildChatStream, type ChatRequest, type TurnRunner } from "./chatStream";
import { progressLabel } from "./progressLabels";

const request: ChatRequest = { sessionId: null, message: "Why is Dallas high?" };
const answer = { answer: "Dallas is High.", meta: { toolCalls: [] } } as unknown as FinalAnswer;

/** Reads every chunk of a stream. */
async function collect(stream: ReadableStream<unknown>): Promise<Record<string, unknown>[]> {
  const chunks: Record<string, unknown>[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return chunks;
    chunks.push(value as Record<string, unknown>);
  }
}

describe("buildChatStream", () => {
  it("streams session, progress (updated in place), text and the validated answer, in order", async () => {
    const run: TurnRunner = async (_req, cb) => {
      cb.onSession?.("11111111-1111-4111-8111-111111111111");
      cb.onToolStart?.("explain_hub_score", { hubId: "dallas" });
      cb.onToolEnd?.("explain_hub_score", { hubIds: ["dallas"] });
      cb.onAnswerDelta?.("Dallas ");
      cb.onAnswerDelta?.("is High.");
      return { sessionId: "11111111-1111-4111-8111-111111111111", answer, usage: { ...NO_USAGE, inputTokens: 1, outputTokens: 1 }, fromCache: false };
    };
    const chunks = await collect(buildChatStream(request, run));
    expect(chunks.map((c) => c.type)).toEqual([
      "start",
      "data-session",
      "data-progress",
      "data-progress",
      "text-start",
      "text-delta",
      "text-delta",
      "text-end",
      "data-answer",
      "finish",
    ]);
    const progress = chunks.filter((c) => c.type === "data-progress");
    expect(progress[0].id).toBe(progress[1].id); // same id → the UI updates the line in place
    expect(progress[1].data).toEqual({ tool: "explain_hub_score", label: "Breaking down Dallas's risk score…", status: "done" });
  });

  it("on retry: closes the draft text, signals the retry, and starts a fresh text part", async () => {
    const run: TurnRunner = async (_req, cb) => {
      cb.onAnswerDelta?.("Draft");
      cb.onRetry?.(["bad number"]);
      cb.onAnswerDelta?.("Fixed");
      return { sessionId: "s", answer, usage: { ...NO_USAGE, inputTokens: 1, outputTokens: 1 }, fromCache: false };
    };
    const types = (await collect(buildChatStream(request, run))).map((c) => `${c.type}${c.id ? `:${c.id}` : ""}`);
    expect(types).toEqual([
      "start",
      "text-start:answer-0",
      "text-delta:answer-0",
      "text-end:answer-0",
      "data-retry:retry-1",
      "text-start:answer-1",
      "text-delta:answer-1",
      "text-end:answer-1",
      "data-answer:answer",
      "finish",
    ]);
  });

  it("turns failures into a friendly data-error with a hint (no internals)", async () => {
    const run: TurnRunner = async () => {
      throw new AgentInputError("That message is too long for me — please keep it under 1,000 characters.");
    };
    const chunks = await collect(buildChatStream(request, run));
    const error = chunks.find((c) => c.type === "data-error")!;
    expect(error.data).toMatchObject({ code: "invalid_request", retryable: false });
    expect((error.data as { hint: string }).hint.length).toBeGreaterThan(10);
    expect(chunks.at(-1)!.type).toBe("finish");
  });
});

describe("progressLabel", () => {
  it("writes friendly lines", () => {
    expect(progressLabel("rank_hubs", { metric: "winter", region: "Midwest" })).toBe("Ranking hubs by winter exposure in the Midwest…");
    expect(progressLabel("compare_hubs", { hubIds: ["miami", "houston", "new-orleans"] })).toBe("Comparing Miami, Houston and New Orleans…");
    expect(progressLabel("get_weather_stat", { hubId: "st-louis", metric: "measurable_snow_day" })).toBe(
      "Counting measurable-snow days in St. Louis…",
    );
  });
});
