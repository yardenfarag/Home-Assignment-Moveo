/**
 * @module scripts/export-session
 *
 * Exports the Claude Code session log(s) into docs/session/ — scrubbed of
 * private details — as required by the assignment ("the full session with the
 * AI agent you worked with").
 *
 * Usage:
 *   npm run session:export -- <path-to-session.jsonl> [more.jsonl ...]
 *   (or set SESSION_LOG_PATHS in .env.local, comma-separated)
 *
 * Output (written only when the leak check passes):
 *   docs/session/transcript.md     readable conversation (tool I/O truncated)
 *   docs/session/transcript.jsonl  the scrubbed conversation records, untruncated
 *   docs/session/subagents/        each sub-agent's own transcript (from the session's own
 *                                  `<session>/subagents/` folder: reviewers, builders, research),
 *                                  plus an index README (D137)
 *
 * Every record is parsed, its private reasoning blocks removed, and every string inside it
 * scrubbed (so escaped paths are caught too). The leak check runs on ALL the output in
 * memory; nothing is written if it finds anything.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { buildScrubRules, findLeaks, scrubRecord, scrubText, type ScrubRule } from "./session/scrub";
import { isConversationRecord, renderTranscript, withoutReasoning, type TranscriptRecord } from "./session/render";
import { runScript } from "./lib/run";

/** Where the transcript files are written. */
const OUTPUT_DIR = resolve("docs", "session");

/** Where the sub-agent transcripts are written. */
const SUBAGENT_DIR = join(OUTPUT_DIR, "subagents");

/** `.env.local` keys whose values are public and stay readable in the log (model ids). */
const PUBLIC_ENV_KEY = /_MODEL$/;

/** What the exporter reads from `.env.local`. */
interface LocalSettings {
  /** Values to scrub: every secret-like value plus `SESSION_SCRUB_TERMS`. */
  secretValues: string[];
  /** `SESSION_LOG_PATHS`, when set. */
  logPaths: string[];
}

/** One sub-agent's transcript, ready to write. */
interface SubagentExport {
  /** File name without extension, e.g. `03-review-react-frontend-code`. */
  name: string;
  /** What the agent was asked to do (its short task description). */
  description: string;
  /** The kind of agent, e.g. `general-purpose`. */
  agentType: string;
  /** Timestamp of its first record. */
  startedAt: string;
  /** Its scrubbed conversation. */
  records: TranscriptRecord[];
}

/**
 * Reads `.env.local` (without loading it into the environment). Every value of 8+ characters is
 * treated as secret except model ids. `SESSION_SCRUB_TERMS` (comma-separated) holds extra
 * private words to remove, e.g. other people's usernames, so the list itself is never committed.
 * @returns the values to scrub and the log paths.
 */
function readLocalSettings(): LocalSettings {
  const envPath = resolve(".env.local");
  const settings: LocalSettings = { secretValues: [], logPaths: [] };
  if (!existsSync(envPath)) return settings;
  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const key = line.slice(0, line.indexOf("=")).trim();
    const rawValue = line.slice(line.indexOf("=") + 1).trim();
    const quoted = /^(["'])(.*)\1$/.exec(rawValue);
    const value = quoted ? quoted[2] : rawValue.replace(/\s+#.*$/, ""); // unquoted values may carry a trailing comment
    const list = () => value.split(",").map((item) => item.trim()).filter(Boolean);
    if (key === "SESSION_SCRUB_TERMS") settings.secretValues.push(...list().filter((term) => term.length >= 4));
    else if (key === "SESSION_LOG_PATHS") settings.logPaths = list();
    else if (!PUBLIC_ENV_KEY.test(key) && value.length >= 8) settings.secretValues.push(value);
  }
  return settings;
}

/**
 * Reads one transcript file into scrubbed conversation records (reasoning removed). A last line
 * that isn't complete JSON (the file is still being written) is skipped with a note; any other
 * bad line stops the export.
 * @param path - the JSONL file.
 * @param rules - scrub rules.
 * @param sidechain - true for a sub-agent's transcript.
 * @returns the records.
 */
function readRecords(path: string, rules: ScrubRule[], sidechain: boolean): TranscriptRecord[] {
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
  const records: TranscriptRecord[] = [];
  lines.forEach((line, index) => {
    let record: TranscriptRecord;
    try {
      record = JSON.parse(line) as TranscriptRecord;
    } catch {
      if (index === lines.length - 1) {
        console.warn(`(skipped the unfinished last line of ${basename(path)}: it is still being written)`);
        return;
      }
      throw new Error(`${path} line ${index + 1} is not valid JSON.`);
    }
    if (!isConversationRecord(record, sidechain)) return;
    const kept = withoutReasoning(record);
    if (kept) records.push(scrubRecord(kept, rules) as TranscriptRecord);
  });
  return records;
}

/**
 * Turns a task description into a file-name slug.
 * @param text - the description.
 * @returns lower-case words joined by dashes (at most 50 characters).
 */
function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
}

/**
 * The sub-agents of a session: `<session>/subagents/agent-*.jsonl` with their `.meta.json`,
 * oldest first. Only this session's own folder is read, never other sessions.
 * @param sessionPath - the main session's JSONL file.
 * @param rules - scrub rules.
 * @returns one export per sub-agent that has any conversation.
 */
function readSubagents(sessionPath: string, rules: ScrubRule[]): SubagentExport[] {
  const dir = join(sessionPath.replace(/\.jsonl$/, ""), "subagents");
  if (!existsSync(dir)) return [];
  const found = readdirSync(dir)
    .filter((file) => /^agent-[\w-]+\.jsonl$/.test(file))
    .map((file) => {
      const metaPath = join(dir, file.replace(/\.jsonl$/, ".meta.json"));
      const meta = existsSync(metaPath) ? (JSON.parse(readFileSync(metaPath, "utf8")) as { description?: string; agentType?: string }) : {};
      const records = readRecords(join(dir, file), rules, true);
      return { description: scrubText(meta.description ?? "Sub-agent", rules), agentType: meta.agentType ?? "agent", startedAt: records[0]?.timestamp ?? "", records };
    })
    .filter((agent) => agent.records.length > 0)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  return found.map((agent, index) => ({ ...agent, name: `${String(index + 1).padStart(2, "0")}-${slug(agent.description)}` }));
}

/**
 * The index page of the sub-agent transcripts.
 * @param agents - the exported sub-agents.
 * @returns Markdown.
 */
function subagentIndex(agents: SubagentExport[]): string {
  const rows = agents.map((a) => `| ${a.startedAt.slice(0, 16).replace("T", " ")} | [${a.description}](${a.name}.md) | ${a.agentType} | ${a.records.length} |`);
  return [
    "# Sub-agent transcripts",
    "",
    "Some work in this session was delegated to sub-agents: the code reviewers, the agents that built",
    "review PRs 3–5 and the cost PR's tool-result step, and documentation research. The main log",
    "([../transcript.md](../transcript.md)) shows what each one was asked and what it reported back.",
    "These files are each sub-agent's own conversation, scrubbed the same way (D131, D137).",
    "",
    "| Started (UTC) | Task | Agent type | Records |",
    "|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}

/**
 * JSONL text for a list of records.
 * @param records - the records.
 * @returns one JSON object per line.
 */
const toJsonl = (records: TranscriptRecord[]) => `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;

/** Entry point. */
function main(): void {
  const settings = readLocalSettings();
  const cliPaths = process.argv.slice(2);
  const inputPaths = cliPaths.length > 0 ? cliPaths : settings.logPaths;
  if (inputPaths.length === 0) {
    console.error("Usage: npm run session:export -- <session.jsonl> [more.jsonl ...]  (or set SESSION_LOG_PATHS in .env.local)");
    process.exit(1);
  }

  const rules = buildScrubRules({ homeDir: homedir(), secretValues: settings.secretValues });
  const records = inputPaths.flatMap((path) => readRecords(path, rules, false));
  const subagents = inputPaths.flatMap((path) => readSubagents(path, rules));

  // Everything to write, checked as one before anything is written.
  const files = new Map<string, string>([
    [join(OUTPUT_DIR, "transcript.jsonl"), toJsonl(records)],
    [join(OUTPUT_DIR, "transcript.md"), renderTranscript(records, "Sneakoscope — full AI coding session (scrubbed)")],
  ]);
  if (subagents.length > 0) files.set(join(SUBAGENT_DIR, "README.md"), subagentIndex(subagents));
  for (const agent of subagents) {
    files.set(join(SUBAGENT_DIR, `${agent.name}.jsonl`), toJsonl(agent.records));
    files.set(join(SUBAGENT_DIR, `${agent.name}.md`), renderTranscript(agent.records, `Sub-agent: ${agent.description} (scrubbed)`, true));
  }
  const leaks = findLeaks([...files.values()].join("\n"), { homeDir: homedir(), secretValues: settings.secretValues });
  if (leaks.length > 0) {
    console.error(`⚠️  Leak check failed, nothing was written: ${leaks.join(", ")}. Add terms to SESSION_SCRUB_TERMS or fix the scrub rules.`);
    process.exit(2);
  }

  mkdirSync(SUBAGENT_DIR, { recursive: true });
  // Clear only the transcript files this script writes, so an agent that's gone leaves no stale copy.
  for (const old of readdirSync(SUBAGENT_DIR).filter((file) => /\.(md|jsonl)$/.test(file))) unlinkSync(join(SUBAGENT_DIR, old));
  for (const [path, content] of files) writeFileSync(path, content);
  console.log(`✅ Exported ${records.length} records from ${inputPaths.length} file(s) and ${subagents.length} sub-agent transcript(s) to ${OUTPUT_DIR}`);
  console.log("🔒 Leak check passed: no emails, tokens, secret values, username or home path left.");
}

void runScript(main, "scripts/export-session");
