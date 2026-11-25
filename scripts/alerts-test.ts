/**
 * @module scripts/alerts-test
 *
 * `npm run alerts:test` — records one clearly marked TEST score-change alert (D124), so the
 * "Recent changes" card can be demoed without waiting for the weather to move a score.
 */
import { sendTestAlert } from "../src/core/alerts/sendTestAlert";

sendTestAlert()
  .then((message) => console.log(`🔔 Recorded: ${message}\nOpen the app: it appears under "Recent changes", tagged as a test.`))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
