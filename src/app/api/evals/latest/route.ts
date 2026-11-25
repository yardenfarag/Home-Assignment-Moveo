/**
 * GET /api/evals/latest — the newest eval run (from the app or the CLI) and whether a new run can
 * start now (D130). Read from the events log; no LLM.
 */
import { connection } from "next/server";
import { evalGateStatus, EVAL_FINISHED } from "@/core/api/evalGate";
import { listEvents } from "@/core/db/eventsRepository";
import { EVAL_CASES } from "../../../../../evals/cases";
import { latestRunSummary } from "../../../../../evals/lib/suite";
import { failure, json } from "../../_lib/http";

/** How far back to look for the last run. */
const LOOKBACK_DAYS = 60;

/**
 * Returns the last run and the limit status.
 * @returns `{ latest: EvalRunSummary | null, caseCount, status: EvalGateStatus }` or a friendly error.
 */
export async function GET(): Promise<Response> {
  await connection(); // always per-request (Cache Components), outside the try/catch
  try {
    const now = new Date();
    const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString();
    const [finished, status] = await Promise.all([
      listEvents({ eventType: EVAL_FINISHED, since, limit: 50 }),
      evalGateStatus({ listEvents: (query) => listEvents(query), now: () => now }),
    ]);
    return json({ latest: latestRunSummary(finished), caseCount: EVAL_CASES.length, status });
  } catch (error) {
    return failure(error, "GET /api/evals/latest");
  }
}
