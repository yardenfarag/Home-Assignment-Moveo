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
 * Output:
 *   docs/session/transcript.md     readable conversation (tool I/O truncated)
 *   docs/session/transcript.jsonl  the scrubbed conversation records, untruncated
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { buildScrubRules, scrubText } from "./session/scrub";
import { isConversationRecord, renderTranscript, type TranscriptRecord } from "./session/render";

const OUTPUT_DIR = resolve("docs", "session");

/**
 * Reads values from .env.local so they are scrubbed even if they were ever
 * pasted into the conversation. `SESSION_SCRUB_TERMS` (comma-separated) holds
 * extra private words to remove, e.g. other people's usernames — kept in
 * .env.local so the list itself is never committed.
 * @returns the values to scrub.
 */
function readLocalSecretValues(): string[] {
  const envPath = resolve(".env.local");
  if (!existsSync(envPath)) return [];
  return readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .flatMap((line) => {
      const key = line.slice(0, line.indexOf("=")).trim();
      const value = line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
      if (key === "SESSION_SCRUB_TERMS") return value.split(",").map((term) => term.trim()).filter((t) => t.length >= 4);
      return value.length >= 8 ? [value] : [];
    });
}

/**
 * Re-checks the exported text for anything that should have been removed.
 * @param text - the exported content.
 * @param secretValues - literal values that must not appear.
 * @returns how many leftovers were found (0 = clean).
 */
function countLeftovers(text: string, secretValues: string[]): number {
  const emails = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)?.length ?? 0;
  const lowered = text.toLowerCase();
  const literals = secretValues.filter((value) => lowered.includes(value.toLowerCase())).length;
  return emails + literals;
}

/** Entry point. */
function main(): void {
  const cliPaths = process.argv.slice(2);
  const envPaths = (process.env.SESSION_LOG_PATHS ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  const inputPaths = cliPaths.length > 0 ? cliPaths : envPaths;
  if (inputPaths.length === 0) {
    console.error("Usage: npm run session:export -- <session.jsonl> [more.jsonl ...]");
    process.exit(1);
  }

  const secretValues = readLocalSecretValues();
  const rules = buildScrubRules({ homeDir: homedir(), secretValues });
  const keptLines: string[] = [];

  for (const inputPath of inputPaths) {
    const lines = readFileSync(inputPath, "utf8").split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      const record = JSON.parse(line) as TranscriptRecord;
      if (isConversationRecord(record)) keptLines.push(scrubText(line, rules));
    }
  }

  const records = keptLines.map((line) => JSON.parse(line) as TranscriptRecord);
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(join(OUTPUT_DIR, "transcript.jsonl"), `${keptLines.join("\n")}\n`);
  const markdown = renderTranscript(records, "Sneakoscope — full AI coding session (scrubbed)");
  writeFileSync(join(OUTPUT_DIR, "transcript.md"), markdown);
  console.log(`✅ Exported ${records.length} records from ${inputPaths.length} file(s) to ${OUTPUT_DIR}`);

  const leftovers = countLeftovers(`${keptLines.join("\n")}\n${markdown}`, [...secretValues, homedir()]);
  if (leftovers > 0) {
    console.error(`⚠️  Leak check: ${leftovers} private item(s) still present — do not commit. Add terms to SESSION_SCRUB_TERMS.`);
    process.exit(2);
  }
  console.log("🔒 Leak check passed: no emails, secrets, scrub terms or home path left.");
}

main();
