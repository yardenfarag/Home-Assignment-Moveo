/**
 * @module scripts/ingest
 *
 * CLI for the data ingest: `npm run ingest` (all active hubs) or
 * `npm run ingest -- --hub=dallas,denver` (only some).
 * Incremental: re-running only fetches what's missing + the last 7 days.
 * Then re-scores every hub under the same run id (D54).
 * `--refresh-fema` re-fetches FEMA records for all hubs.
 */
import { createIngestDeps } from "../src/core/ingest/createIngestDeps";
import { runIngestThenScore } from "../src/core/pipeline/runIngestThenScore";
import { createScoringDeps } from "../src/core/scoring/createScoringDeps";

/**
 * Reads `--hub=a,b` from the command line. On PowerShell, npm swallows the `--`
 * separator and turns `--hub=x` into the env var `npm_config_hub`, so both are read.
 * @returns hub ids, or undefined for all hubs.
 */
function parseHubIds(): string[] | undefined {
  const arg = process.argv.find((a) => a.startsWith("--hub="))?.slice("--hub=".length) ?? process.env.npm_config_hub;
  return arg ? arg.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
}

/** Runs ingest + scoring and prints a summary. Exit code 1 if any hub failed. */
async function main(): Promise<void> {
  const log = (line: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${line}`);
  log("🦉 Ingest started");
  const refreshFema = process.argv.includes("--refresh-fema") || process.env.npm_config_refresh_fema === "true";
  const { ingest, scoring } = await runIngestThenScore(
    { trigger: "cli", hubIds: parseHubIds(), refreshFema },
    { ingest: createIngestDeps(log), scoring: createScoringDeps(log) },
  );
  log(
    `🏁 Done — ${ingest.hubsProcessed} hubs, ${ingest.hubsFailed} failed, ` +
      `${ingest.weatherRowsSaved} weather rows, ${ingest.femaRecordsSaved} FEMA records; ` +
      `${scoring.hubsScored} hubs scored (run ${ingest.runId})`,
  );
  if (ingest.hubsFailed > 0 || scoring.hubsFailed > 0) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
