/**
 * GET /api/cron/ingest — the nightly job (A3, D14, D54): fetch new weather
 * days (+ FEMA for new hubs), then re-score every hub under one run id.
 * Called by Vercel Cron with `Authorization: Bearer <CRON_SECRET>`; not behind
 * the site login (proxy.ts excludes /api/cron).
 */
import { connection } from "next/server";
import { createIngestDeps } from "@/core/ingest/createIngestDeps";
import { runIngestThenScore } from "@/core/pipeline/runIngestThenScore";
import { createScoringDeps } from "@/core/scoring/createScoringDeps";
import { failure, json, requireCronAuth } from "../../_lib/http";

/** Vercel Hobby allows up to 300 s; a nightly run takes about a minute. */
export const maxDuration = 300;

/**
 * Runs the pipeline and returns a short summary.
 * @param request - the HTTP request.
 * @returns JSON summary, or a friendly error.
 */
export async function GET(request: Request): Promise<Response> {
  await connection(); // always per-request: never prerender (Cache Components), and keep it outside the try/catch
  try {
    const denied = requireCronAuth(request);
    if (denied) return denied;
    const log = (line: string) => console.log(`[cron] ${line}`);
    const { ingest, scoring } = await runIngestThenScore(
      { trigger: "cron" },
      { ingest: createIngestDeps(log), scoring: createScoringDeps(log) },
    );
    const ok = ingest.hubsFailed === 0 && scoring.hubsFailed === 0;
    return json(
      {
        ok,
        runId: ingest.runId,
        hubs: ingest.hubsProcessed,
        weatherRowsSaved: ingest.weatherRowsSaved,
        hubsScored: scoring.hubsScored,
        failedHubs: [...ingest.results, ...scoring.results].filter((r) => r.error).map((r) => r.hubId),
      },
      ok ? 200 : 207,
    );
  } catch (error) {
    return failure(error, "GET /api/cron/ingest");
  }
}
