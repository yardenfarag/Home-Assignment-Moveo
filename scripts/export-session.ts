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
 *
 * Every record is parsed, its private reasoning blocks removed, and every string inside it
 * scrubbed (so escaped paths are caught too). The leak check runs on the final text in
 * memory; nothing is written if it finds anything.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { buildScrubRules, findLeaks, scrubRecord } from "./session/scrub";
import { isConversationRecord, renderTranscript, withoutReasoning, type TranscriptRecord } from "./session/render";

/** Where the transcript files are written. */
const OUTPUT_DIR = resolve("docs", "session");

/** `.env.local` keys whose values are public and stay readable in the log (model ids). */
const PUBLIC_ENV_KEY = /_MODEL$/;

/** What the exporter reads from `.env.local`. */
interface LocalSettings {
  /** Values to scrub: every secret-like value plus `SESSION_SCRUB_TERMS`. */
  secretValues: string[];
  /** `SESSION_LOG_PATHS`, when set. */
  logPaths: string[];
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
  const records: TranscriptRecord[] = [];
  for (const inputPath of inputPaths) {
    const lines = readFileSync(inputPath, "utf8").split(/\r?\n/).filter(Boolean);
    lines.forEach((line, index) => {
      let record: TranscriptRecord;
      try {
        record = JSON.parse(line) as TranscriptRecord;
      } catch {
        throw new Error(`${inputPath} line ${index + 1} is not valid JSON (is the session still being written?).`);
      }
      if (!isConversationRecord(record)) return;
      const kept = withoutReasoning(record);
      if (kept) records.push(scrubRecord(kept, rules) as TranscriptRecord);
    });
  }

  const jsonl = `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
  const markdown = renderTranscript(records, "Sneakoscope — full AI coding session (scrubbed)");
  const leaks = findLeaks(`${jsonl}\n${markdown}`, { homeDir: homedir(), secretValues: settings.secretValues });
  if (leaks.length > 0) {
    console.error(`⚠️  Leak check failed, nothing was written: ${leaks.join(", ")}. Add terms to SESSION_SCRUB_TERMS or fix the scrub rules.`);
    process.exit(2);
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(join(OUTPUT_DIR, "transcript.jsonl"), jsonl);
  writeFileSync(join(OUTPUT_DIR, "transcript.md"), markdown);
  console.log(`✅ Exported ${records.length} records from ${inputPaths.length} file(s) to ${OUTPUT_DIR}`);
  console.log("🔒 Leak check passed: no emails, tokens, secret values, username or home path left.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
