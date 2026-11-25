/**
 * @module app/_lib/ndjson
 *
 * Reads a newline-delimited JSON stream (the eval run's progress, D130) with an inactivity
 * watchdog (S3): when no data arrives for `idleMs`, reading stops instead of waiting forever.
 * A line that isn't valid JSON is counted and skipped, so it isn't mistaken for a dropped
 * connection (N5).
 */

/** How a read ended. */
export interface NdjsonResult {
  /** "done": the stream ended. "idle": nothing arrived for too long, so we stopped reading. */
  ended: "done" | "idle";
  /** Lines that weren't valid JSON (skipped). */
  malformed: number;
}

/**
 * Reads every JSON line of a stream.
 * @param body - the response body.
 * @param onValue - called with each parsed line.
 * @param idleMs - longest wait for new data before giving up.
 * @returns how the read ended.
 * @throws when the connection itself fails (e.g. a network drop).
 */
export async function readNdjson(body: ReadableStream<Uint8Array<ArrayBuffer>>,onValue: (value: unknown) => void, idleMs: number): Promise<NdjsonResult> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let malformed = 0;

  /** Parses one line (skips blank and invalid ones). */
  const handle = (line: string) => {
    if (!line.trim()) return;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      malformed++;
      return;
    }
    onValue(value);
  };

  for (;;) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const idle = new Promise<"idle">((resolve) => {
      timer = setTimeout(() => resolve("idle"), idleMs);
    });
    const next = await Promise.race([reader.read(), idle]).finally(() => clearTimeout(timer));
    if (next === "idle") {
      void reader.cancel().catch(() => {}); // stop the download; nothing more will be read
      return { ended: "idle", malformed };
    }
    if (next.done) break;
    buffer += next.value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(handle);
  }
  handle(buffer);
  return { ended: "done", malformed };
}
