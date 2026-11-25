/**
 * @module scripts/ingest
 *
 * CLI for the data ingest: `npm run ingest` (all active hubs) or
 * `npm run ingest -- --hub=dallas,denver` (only some).
 * Incremental: re-running only fetches what's missing + the last 7 days.
 */
import { createIngestDeps } from "../src/core/ingest/createIngestDeps";
import { runIngest } from "../src/core/ingest/runIngest";

/**
 * Reads `--hub=a,b` from the command line. On PowerShell, npm swallows the `--`
 * separator and turns `--hub=x` into the env var `npm_config_hub`, so both are read.
 * @returns hub ids, or undefined for all hubs.
 */
function parseHubIds(): string[] | undefined {
  const arg = process.argv.find((a) => a.startsWith("--hub="))?.slice("--hub=".length) ?? process.env.npm_config_hub;
  return arg ? arg.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
}

/** Runs the ingest and prints a summary. Exit code 1 if any hub failed. */
async function main(): Promise<void> {
  const log = (line: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${line}`);
  log("🦉 Ingest started");
  const summary = await runIngest({ trigger: "cli", hubIds: parseHubIds() }, createIngestDeps(log));
  log(
    `🏁 Done — ${summary.hubsProcessed} hubs, ${summary.hubsFailed} failed, ` +
      `${summary.weatherRowsSaved} weather rows, ${summary.femaRecordsSaved} FEMA records (run ${summary.runId})`,
  );
  if (summary.hubsFailed > 0) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
