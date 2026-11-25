/**
 * GET /api/cron/ingest — the nightly job (A3, D14, D54): fetch new weather
 * days (+ FEMA for new hubs), then re-score every hub under one run id.
 * Called by Vercel Cron with `Authorization: Bearer <CRON_SECRET>`; not behind
 * a site login (the app has none, D113). The ingest has a time budget so scoring
 * always fits in `maxDuration`, and a second run while one is in progress is skipped.
 */
import { connection } from "next/server";
import { PIPELINE_TIMING } from "@/core/config/timeouts";
import { listEvents } from "@/core/db/eventsRepository";
import { createIngestDeps } from "@/core/ingest/createIngestDeps";
import { runIngestThenScore } from "@/core/pipeline/runIngestThenScore";
import { createScoringDeps } from "@/core/scoring/createScoringDeps";
import { failure, json, requireCronAuth } from "../../_lib/http";

/**
 * Vercel Hobby allows up to 300 s; a nightly run takes about a minute. Must equal
 * PIPELINE_TIMING.cronMaxDurationS (Next reads this literal statically; a test checks they match).
 */
export const maxDuration = 300;

/**
 * Runs the pipeline and returns a short summary.
 * @param request - the HTTP request.
 * @returns JSON summary (409 when another run is in progress), or a friendly error.
 */
export async function GET(request: Request): Promise<Response> {
  await connection(); // always per-request: never prerender (Cache Components), and keep it outside the try/catch
  try {
    const denied = requireCronAuth(request);
    if (denied) return denied;
    const log = (line: string) => console.log(`[cron] ${line}`);
    const result = await runIngestThenScore(
      { trigger: "cron", timeBudgetMs: PIPELINE_TIMING.ingestBudgetMs },
      { ingest: createIngestDeps(log), scoring: createScoringDeps(log), guard: { listEvents: (query) => listEvents(query), now: () => new Date() } },
    );
    if (result.status === "skipped") {
      return json({ ok: false, skipped: true, reason: "another run is in progress", runningRunId: result.runningRunId, runningSince: result.runningSince }, 409);
    }
    const { ingest, scoring } = result;
    const ok = ingest.hubsFailed === 0 && ingest.hubsSkipped === 0 && scoring.hubsFailed === 0;
    return json(
      {
        ok,
        runId: ingest.runId,
        hubs: ingest.hubsProcessed,
        weatherRowsSaved: ingest.weatherRowsSaved,
        hubsScored: scoring.hubsScored,
        failedHubs: [
          ...new Set([...ingest.results.filter((r) => r.error || r.femaError), ...scoring.results.filter((r) => r.error)].map((r) => r.hubId)),
        ],
        skippedHubs: ingest.results.filter((r) => r.skipped).map((r) => r.hubId),
      },
      ok ? 200 : 207,
    );
  } catch (error) {
    return failure(error, "GET /api/cron/ingest");
  }
}
