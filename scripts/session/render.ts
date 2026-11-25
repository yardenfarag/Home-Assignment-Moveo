/**
 * @module scripts/session/render
 *
 * Turns Claude Code transcript records (JSONL) into a readable Markdown log.
 * Only conversation records (`user` / `assistant`) are kept; internal
 * bookkeeping records and the model's private reasoning blocks are skipped.
 * Long tool inputs/outputs are truncated to keep the file readable.
 */

/** Max characters shown for one tool input or tool result. */
const MAX_BLOCK_CHARS = 2500;

/** A content block inside a transcript message (only the fields we use). */
interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: unknown;
  content?: unknown;
  source?: { media_type?: string };
  title?: string;
}

/** One transcript record (only the fields we use). */
export interface TranscriptRecord {
  type: string;
  timestamp?: string;
  isSidechain?: boolean;
  message?: { role?: string; content?: string | ContentBlock[] };
}

/**
 * Keeps only user/assistant records: from the main thread, or (for a sub-agent's own transcript,
 * where every record is a "sidechain") from that sub-agent.
 * @param record - a parsed JSONL line.
 * @param sidechain - true when reading a sub-agent's transcript.
 * @returns true when the record belongs in the exported log.
 */
export function isConversationRecord(record: TranscriptRecord, sidechain = false): boolean {
  return (record.type === "user" || record.type === "assistant") && !!record.isSidechain === sidechain && !!record.message;
}

/** Content block types that hold the model's private reasoning (never exported, D41). */
const REASONING_BLOCKS = new Set(["thinking", "redacted_thinking"]);

/**
 * Removes the model's private reasoning blocks from a record (for the raw JSONL export).
 * @param record - a conversation record.
 * @returns a copy without reasoning blocks, or null when nothing else was in it.
 */
export function withoutReasoning(record: TranscriptRecord): TranscriptRecord | null {
  const content = record.message?.content;
  if (!Array.isArray(content)) return record;
  const kept = content.filter((block) => !REASONING_BLOCKS.has(block.type));
  if (kept.length === 0) return null;
  return { ...record, message: { ...record.message, content: kept } };
}

/**
 * Shortens long text and notes how much was cut.
 * @param text - text to shorten.
 * @returns the possibly truncated text.
 */
export function truncate(text: string): string {
  if (text.length <= MAX_BLOCK_CHARS) return text;
  return `${text.slice(0, MAX_BLOCK_CHARS)}\n… [truncated ${text.length - MAX_BLOCK_CHARS} chars]`;
}

/**
 * Flattens a tool result's content into plain text.
 * @param content - string or array of blocks.
 * @returns plain text.
 */
function toolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block: ContentBlock) => (block.type === "text" ? (block.text ?? "") : `[${block.type}]`))
      .join("\n");
  }
  return JSON.stringify(content, null, 2);
}

/**
 * Renders one content block as Markdown.
 * @param block - the block.
 * @returns Markdown, or an empty string for skipped blocks.
 */
function renderBlock(block: ContentBlock): string {
  switch (block.type) {
    case "text":
      return block.text ?? "";
    case "tool_use":
      return `<details><summary>🔧 Tool call: <code>${block.name}</code></summary>\n\n\`\`\`json\n${truncate(
        JSON.stringify(block.input, null, 2),
      )}\n\`\`\`\n</details>`;
    case "tool_result":
      return `<details><summary>📤 Tool result</summary>\n\n\`\`\`\n${truncate(toolResultText(block.content))}\n\`\`\`\n</details>`;
    case "document":
      return `📎 *[Attached document${block.title ? `: ${block.title}` : ""}]*`;
    case "image":
      return "🖼️ *[Attached image]*";
    default:
      return ""; // reasoning blocks and unknown types are not exported
  }
}

/**
 * Renders a list of records as one Markdown document.
 * @param records - parsed transcript records (already scrubbed).
 * @param title - document heading.
 * @param sidechain - true for a sub-agent's transcript.
 * @returns the Markdown text.
 */
export function renderTranscript(records: TranscriptRecord[], title: string, sidechain = false): string {
  const parts = [`# ${title}`, ""];
  for (const record of records.filter((r) => isConversationRecord(r, sidechain))) {
    const content = record.message?.content;
    const blocks: ContentBlock[] = typeof content === "string" ? [{ type: "text", text: content }] : (content ?? []);
    const body = blocks.map(renderBlock).filter((text) => text.trim().length > 0).join("\n\n");
    if (!body) continue;
    const onlyToolResults = blocks.every((block) => block.type === "tool_result");
    const heading = record.type === "assistant" ? "🤖 Claude" : onlyToolResults ? "⚙️ Tool output" : "👤 User";
    parts.push(`### ${heading}${record.timestamp ? ` · ${record.timestamp}` : ""}`, "", body, "", "---", "");
  }
  return parts.join("\n");
}
