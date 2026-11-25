/**
 * @module scripts/alerts-test
 *
 * `npm run alerts:test` — records one clearly marked TEST score-change alert (D124), so the
 * "Recent changes" card can be demoed without waiting for the weather to move a score.
 */
import { sendTestAlert } from "../src/core/alerts/sendTestAlert";
import { runScript } from "./lib/run";

/** Records the test alert and says where to see it. */
async function main(): Promise<void> {
  const message = await sendTestAlert();
  console.log(`🔔 Recorded: ${message}\nOpen the app: it appears under "Recent changes", tagged as a test.`);
}

void runScript(main, "scripts/alerts-test");
