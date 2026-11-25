import { describe, expect, it } from "vitest";
import { readNdjson } from "./ndjson";

const encoder = new TextEncoder();

/** A stream that sends the given chunks, then either closes or stays open forever. */
function streamOf(chunks: string[], close = true): ReadableStream<Uint8Array<ArrayBuffer>> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      if (close) controller.close();
    },
  });
}

describe("readNdjson (eval progress stream)", () => {
  it("parses lines split across chunks, including a last line without a newline", async () => {
    const values: unknown[] = [];
    const result = await readNdjson(streamOf(['{"type":"st', 'art"}\n{"type":"case"}\n', '{"type":"done"}']), (v) => values.push(v), 1_000);
    expect(values).toEqual([{ type: "start" }, { type: "case" }, { type: "done" }]);
    expect(result).toEqual({ ended: "done", malformed: 0 });
  });

  it("skips and counts a malformed line instead of treating it as a dropped connection (N5)", async () => {
    const values: unknown[] = [];
    const result = await readNdjson(streamOf(['{"type":"start"}\n', "{oops\n", '{"type":"done"}\n']), (v) => values.push(v), 1_000);
    expect(values).toHaveLength(2);
    expect(result).toEqual({ ended: "done", malformed: 1 });
  });

  it("stops waiting when nothing arrives for too long (S3 watchdog)", async () => {
    const values: unknown[] = [];
    const result = await readNdjson(streamOf(['{"type":"start"}\n'], false), (v) => values.push(v), 30);
    expect(values).toEqual([{ type: "start" }]);
    expect(result.ended).toBe("idle");
  });
});
