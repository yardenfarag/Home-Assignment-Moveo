/**
 * POST /api/evals/run — runs the eval set from the app and streams progress, one JSON object per
 * line (`SuiteEvent`), then saves the summary as an `eval.finished` event (D130).
 * Limited for everyone together (EVAL_RUN_LIMITS): 1 run per 30 minutes, 4 per day, never two at once.
 */
import { randomUUID } from "node:crypto";
import { createAnswerQuestionDeps } from "@/core/agent/createAnswerQuestionDeps";
import { EVAL_FINISHED, EVAL_RUN_LIMITS, EVAL_UI_STARTED, decideEvalGate, readRunEvents, wonRunSlot, type EvalGateStatus } from "@/core/api/evalGate";
import { describeUnknownError, formatBoundaryMessage } from "@/core/errors/boundaryError";
import { listEvents, recordEvent } from "@/core/db/eventsRepository";
import { userError } from "@/core/errors/userErrors";
import { createJudgeModel } from "@/core/judge/judgeAnswer";
import type { Json } from "@/core/db/database.types";
import { runEvalSuite, type SuiteEvent } from "../../../../../evals/lib/suite";
import { errorResponse, failure } from "../../_lib/http";

/** A full run takes ~2–4 minutes; Vercel Hobby allows up to 300 s. */
export const maxDuration = 300;

/**
 * The friendly refusal for a run that can't start now.
 * @param status - the gate status.
 * @returns the 429 response (with the status, so the UI can say when).
 */
function refusal(status: EvalGateStatus): Response {
  const base = userError("too_many_requests");
  const copy: Record<NonNullable<EvalGateStatus["reason"]>, { message: string; hint: string }> = {
    running: { message: "An eval run is already in progress.", hint: "Its results will show up here in a few minutes." },
    too_soon: { message: "The evals ran just a little while ago.", hint: `To keep costs sane, they can run once every ${EVAL_RUN_LIMITS.minutesBetweenRuns} minutes.` },
    daily_limit: { message: `The evals have run ${EVAL_RUN_LIMITS.runsPerDay} times today.`, hint: "The daily limit resets at midnight UTC." },
  };
  const { status: httpStatus, ...body } = { ...base, ...copy[status.reason ?? "running"] };
  return Response.json({ error: body, status }, { status: httpStatus, headers: { "Cache-Control": "no-store" } });
}

/**
 * Starts a run (if the limits allow) and streams its progress.
 * @returns an NDJSON stream, or a friendly JSON error before it starts.
 */
export async function POST(): Promise<Response> {
  try {
    const now = new Date();
    const before = await readRunEvents({ listEvents: (query) => listEvents(query) }, now);
    const status = decideEvalGate(before.starts, before.finishes, now);
    if (!status.allowed) return refusal(status);

    // Build everything that can fail on config before claiming the slot. (No stray-abort guard here:
    // it exits the process, and Next.js already logs stray rejections itself, D108.)
    const deps = createAnswerQuestionDeps();
    let judge: ReturnType<typeof createJudgeModel> | null = null;
    try {
      judge = createJudgeModel();
    } catch (error) {
      console.warn(formatBoundaryMessage({ name: "JudgeUnavailable", message: describeUnknownError(error), functionName: "POST /api/evals/run", boundary: "apiRoute" }));
    }
    const context = await deps.loadContext({ today: deps.today(), units: "us" });

    const runId = randomUUID();
    const claimed = await recordEvent({ eventType: EVAL_UI_STARTED, source: "eval", level: "info", correlationId: runId, message: "Eval run started from the app", payload: { model: deps.agentModel.modelId } });
    if (!claimed) return errorResponse(userError("internal_error")); // can't count it, so don't run it
    const after = await readRunEvents({ listEvents: (query) => listEvents(query) }, new Date());
    if (!wonRunSlot(after.starts, after.finishes, runId, new Date())) {
      await recordEvent({ eventType: EVAL_FINISHED, source: "eval", level: "info", correlationId: runId, message: "Eval run skipped: another run started at the same moment", payload: { summary: null } });
      return refusal({ ...status, allowed: false, reason: "running", running: true });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let open = true;
        const send = (event: SuiteEvent | { type: "error"; message: string }) => {
          if (!open) return;
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          } catch {
            open = false; // the browser left; keep running so the result is still saved
          }
        };
        try {
          const { summary } = await runEvalSuite({ agent: deps.agentModel, context, judge, onEvent: send });
          const failed = summary.cases.filter((c) => !c.pass).map((c) => c.caseId);
          await recordEvent({
            eventType: EVAL_FINISHED,
            source: "eval",
            level: failed.length ? "warn" : "info",
            correlationId: runId,
            message: `${summary.passed}/${summary.total} runs passed on ${summary.model} (from the app)`,
            payload: { label: summary.model, repeat: 1, failedCases: failed, judge: summary.judge, summary: summary as unknown as Json },
          });
        } catch (error) {
          console.error(formatBoundaryMessage({ name: error instanceof Error ? error.name : "UnknownError", message: describeUnknownError(error), functionName: "POST /api/evals/run", boundary: "apiRoute" }));
          await recordEvent({ eventType: EVAL_FINISHED, source: "eval", level: "error", correlationId: runId, message: "Eval run from the app failed", payload: { summary: null } });
          send({ type: "error", message: "The eval run stopped before it finished. Please try again later." });
        } finally {
          if (open) controller.close();
        }
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error, "POST /api/evals/run");
  }
}
