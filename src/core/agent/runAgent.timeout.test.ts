import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { runAgent } from "./runAgent";
import { ctx } from "./testFixtures";

// Shrink the step timeout so the tests run in well under a second.
vi.mock("../config/timeouts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../config/timeouts")>();
  return { ...original, AGENT_TIMEOUTS: { attemptMs: 2_000, stepMs: 200, toolMs: 1_000, turnMs: 5_000 } };
});

/** A model that never responds: it waits until the SDK aborts the step. */
function silentModel() {
  return new MockLanguageModelV4({
    doStream: async ({ abortSignal }) =>
      new Promise((_, reject) => {
        abortSignal?.addEventListener("abort", () => reject(abortSignal.reason));
      }),
  });
}

/** A model that starts writing its answer, then stalls mid-stream until aborted (what slow real models did). */
function stallingModel() {
  return new MockLanguageModelV4({
    doStream: async ({ abortSignal }) => ({
      stream: new ReadableStream<LanguageModelV4StreamPart>({
        start(controller) {
          controller.enqueue({ type: "text-start", id: "t1" });
          controller.enqueue({ type: "text-delta", id: "t1", delta: '{"answer":"Dallas is' });
          abortSignal?.addEventListener("abort", () => controller.error(abortSignal.reason));
        },
      }),
    }),
  });
}

describe("runAgent step timeout (bakeoff crash, D108)", () => {
  for (const [label, makeModel] of [
    ["no response at all", silentModel],
    ["stalls mid-stream", stallingModel],
  ] as const) {
    it(`${label}: becomes a clean LlmCallError, with no unhandled rejection`, async () => {
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown) => unhandled.push(reason);
      process.on("unhandledRejection", onUnhandled);
      try {
        await expect(runAgent({ message: "Why is Dallas high?", history: [] }, { model: makeModel(), modelId: "mock/slow", context: ctx })).rejects.toThrow(
          /LlmCallError \|\| .*timeout.* \|\| runAgent \|\| 🦉/i,
        );
        await new Promise((r) => setTimeout(r, 50));
        expect(unhandled).toEqual([]);
      } finally {
        process.off("unhandledRejection", onUnhandled);
      }
    });
  }
});
