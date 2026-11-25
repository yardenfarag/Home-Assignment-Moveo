import { describe, expect, it } from "vitest";
import { isConversationRecord, renderTranscript, truncate } from "./render";

describe("isConversationRecord", () => {
  it("keeps main-thread user/assistant records only", () => {
    expect(isConversationRecord({ type: "user", message: { content: "hi" } })).toBe(true);
    expect(isConversationRecord({ type: "assistant", message: { content: [] } })).toBe(true);
    expect(isConversationRecord({ type: "user", isSidechain: true, message: { content: "x" } })).toBe(false);
    expect(isConversationRecord({ type: "summary" })).toBe(false);
  });
});

describe("renderTranscript", () => {
  it("renders text and tool calls, skips reasoning blocks", () => {
    const markdown = renderTranscript(
      [
        { type: "user", timestamp: "t1", message: { content: "Hello" } },
        {
          type: "assistant",
          timestamp: "t2",
          message: {
            content: [
              { type: "thinking", text: "private" },
              { type: "text", text: "Hi there" },
              { type: "tool_use", name: "Bash", input: { command: "ls" } },
            ],
          },
        },
        { type: "user", message: { content: [{ type: "tool_result", content: "file.txt" }] } },
      ],
      "Session",
    );
    expect(markdown).toContain("### 👤 User · t1");
    expect(markdown).toContain("Hi there");
    expect(markdown).toContain("<code>Bash</code>");
    expect(markdown).toContain("### ⚙️ Tool output");
    expect(markdown).not.toContain("private");
  });
});

describe("truncate", () => {
  it("cuts long text and reports the cut", () => {
    const result = truncate("a".repeat(3000));
    expect(result).toContain("[truncated 500 chars]");
  });
});
