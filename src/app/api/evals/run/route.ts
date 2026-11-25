/**
 * POST /api/evals/run — runs the eval set from the app and streams progress, one JSON object per
 * line (`SuiteEvent`), then saves the summary as an `eval.finished` event (D130).
 * Limited for everyone together (EVAL_RUN_LIMITS): 1 run per 30 minutes, 4 per day, never two at once.
 *
 * The run is registered with `after()`, so it keeps going (and its result is saved) even when the
 * browser closes the window: the platform waits for it up to `maxDuration`.
 */
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { createAnswerQuestionDeps } from "@/core/agent/createAnswerQuestionDeps";
import { EVAL_FINISHED, EVAL_UI_STARTED, decideEvalGate, readRunEvents, wonRunSlot, type EvalGateStatus } from "@/core/api/evalGate";
import type { Json } from "@/core/db/database.types";
import { listEvents, recordEvent } from "@/core/db/eventsRepository";
import { boundaryLogLine, describeUnknownError, formatBoundaryMessage } from "@/core/errors/boundaryError";
import { EVAL_RUN_REFUSALS, EVAL_RUN_STOPPED, userError } from "@/core/errors/userErrors";
import { createJudgeModel, type JudgeModel } from "@/core/judge/judgeAnswer";
import { runEvalSuite, type SuiteEvent } from "../../../../../evals/lib/suite";
import { errorResponse, failure } from "../../_lib/http";

/** A run takes about 1–2 minutes (13 cases, 3 at a time); Vercel Hobby allows up to 300 s. */
export const maxDuration = 300;

/**
 * Time budget for the cases (D133): no new case starts after this, so the summary is saved before
 * Vercel's 300 s limit. A case started just before it can still take ~145 s (agent turn 100 s +
 * judge 45 s). Normal runs take 1–2 minutes, so this rarely skips anything.
 */
const SUITE_DEADLINE_MS = 150_000;

/** The function name used in log lines. */
const ROUTE = "POST /api/evals/run";

/**
 * The friendly refusal for a run that can't start now.
 * @param status - the gate status.
 * @returns the 429 response, with the status so the UI can say when the next run is possible.
 */
function refusal(status: EvalGateStatus): Response {
  const copy = EVAL_RUN_REFUSALS[status.reason ?? "running"];
  return errorResponse(userError("too_many_requests", copy.message, copy.hint), { status });
}

/**
 * The judge, or null (code checks only) when it isn't configured.
 * @returns the judge model or null.
 */
function judgeOrNull(): JudgeModel | null {
  try {
    return createJudgeModel();
  } catch (error) {
    console.warn(formatBoundaryMessage({ name: "JudgeUnavailable", message: describeUnknownError(error), functionName: ROUTE, boundary: "apiRoute" }));
    return null;
  }
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
    const judge = judgeOrNull();
    const context = await deps.loadContext({ today: deps.today(), units: "us" });

    const runId = randomUUID();
    const claimed = await recordEvent({ eventType: EVAL_UI_STARTED, source: "eval", level: "info", correlationId: runId, message: "Eval run started from the app", payload: { model: deps.agentModel.modelId } });
    if (!claimed) return errorResponse(userError("internal_error")); // can't count it, so don't run it
    const afterClaim = await readRunEvents({ listEvents: (query) => listEvents(query) }, new Date());
    if (!wonRunSlot(afterClaim.starts, afterClaim.finishes, runId, new Date())) {
      // `skipped` tells the gate this start didn't really use one of the day's runs.
      await recordEvent({ eventType: EVAL_FINISHED, source: "eval", level: "info", correlationId: runId, message: "Eval run skipped: another run started at the same moment", payload: { summary: null, skipped: true } });
      return refusal({ ...status, allowed: false, reason: "running", running: true });
    }

    const encoder = new TextEncoder();
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
    let open = true;
    const stream = new ReadableStream<Uint8Array>({
      start: (c) => {
        controller = c;
      },
      cancel: () => {
        open = false; // the browser left; the run goes on (see `after` below)
      },
    });
    /** Sends one progress line while the browser is still listening. */
    const send = (event: SuiteEvent | { type: "error"; message: string }) => {
      if (!open || !controller) return;
      try {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      } catch {
        open = false;
      }
    };
    /** Ends the stream once (closing a cancelled stream throws, so it's guarded). */
    const close = () => {
      if (!open) return;
      open = false;
      try {
        controller?.close();
      } catch {
        // already closed by the browser
      }
    };

    const run = (async () => {
      try {
        const { summary } = await runEvalSuite({ agent: deps.agentModel, context, judge, onEvent: send, deadlineMs: SUITE_DEADLINE_MS });
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
        console.error(boundaryLogLine(error, ROUTE, "apiRoute"));
        await recordEvent({ eventType: EVAL_FINISHED, source: "eval", level: "error", correlationId: runId, message: "Eval run from the app failed", payload: { summary: null } });
        send({ type: "error", message: EVAL_RUN_STOPPED });
      } finally {
        close();
      }
    })();
    after(() => run); // keep the function alive until the run is saved, even if nobody is listening

    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error, ROUTE);
  }
}
