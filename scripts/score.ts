/**
 * @module scripts/score
 *
 * `npm run score` — recompute and save scores for all active hubs from the data
 * already in the database (no API calls). The ingest runs this automatically.
 */
import { createScoringDeps } from "../src/core/scoring/createScoringDeps";
import { runScoring } from "../src/core/scoring/runScoring";

/** Runs scoring and prints a summary. Exit code 1 if any hub failed. */
async function main(): Promise<void> {
  const log = (line: string) => console.log(line);
  log("📊 Scoring hubs…");
  const summary = await runScoring({ trigger: "cli" }, createScoringDeps(log));
  log(`🏁 ${summary.hubsScored} scored, ${summary.hubsFailed} failed (scoring ${summary.scoringVersion}, run ${summary.runId})`);
  if (summary.hubsFailed > 0) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
