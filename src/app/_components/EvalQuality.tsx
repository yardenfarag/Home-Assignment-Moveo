"use client";
/**
 * "Answer quality" (Step 16, D130): the last eval run in one line of the overview, and a dialog
 * with the details and a "Run evals" button that streams progress case by case.
 * Runs are limited for everyone together (1 per 30 min, 4 per day); the dialog says when the next
 * one is possible. Data: GET /api/evals/latest and POST /api/evals/run (NDJSON).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { EVAL_RUN_LIMITS, type EvalGateStatus } from "@/core/api/evalGate";
// Types only (erased at build time): the event and summary shapes are defined once, by the eval suite.
import type { CaseOutcome, EvalRunSummary, SuiteEvent } from "../../../evals/lib/suite";
import { EVAL_COPY } from "../_lib/clientErrors";
import { fetchJson } from "../_lib/fetchJson";
import { relativeTime } from "../_lib/labels";
import { readNdjson } from "../_lib/ndjson";
import { FOCUS_RING } from "../_lib/styles";

/** What GET /api/evals/latest returns. */
interface LatestRun {
  latest: EvalRunSummary | null;
  /** How many questions a run asks (from the eval set). */
  caseCount: number;
  status: EvalGateStatus;
}

/** A live run's progress in the dialog. */
interface LiveRun {
  cases: { caseId: string; title: string }[];
  done: Record<string, CaseOutcome>;
  selfTest: { correct: number; total: number } | null;
  summary: EvalRunSummary | null;
  error: string | null;
}

/** How often to re-check while someone else's run is in progress. */
const POLL_MS = 15_000;

/** Longest wait for the run to answer at all (it sets up the agent and claims the run slot first). */
const START_TIMEOUT_MS = 45_000;

/**
 * Longest silence between progress lines before we stop watching. One case can take up to the
 * agent's 100-second turn limit plus judging, so this is generous; the run itself keeps going.
 */
const IDLE_TIMEOUT_MS = 150_000;

/** A run that has just started streaming: nothing reported yet. */
const EMPTY_LIVE_RUN: LiveRun = { cases: [], done: {}, selfTest: null, summary: null, error: null };

/** One progress event from the stream (the suite's events, or the route's own error line). */
type RunEvent = SuiteEvent | { type: "error"; message: string };

/**
 * Applies one progress event to the live run.
 * @param state - the run so far.
 * @param event - the event.
 * @returns the updated run.
 */
function applyEvent(state: LiveRun, event: RunEvent): LiveRun {
  if (event.type === "start") return { ...state, cases: event.cases };
  if (event.type === "selftest") return { ...state, selfTest: { correct: event.correct, total: event.total } };
  if (event.type === "case") return { ...state, done: { ...state.done, [event.outcome.caseId]: event.outcome } };
  if (event.type === "done") return { ...state, summary: event.summary };
  return { ...state, error: event.message };
}

/**
 * True when a parsed line looks like one of the run's events.
 * @param value - a parsed JSON line.
 * @returns whether it has a known `type`.
 */
const isRunEvent = (value: unknown): value is RunEvent =>
  typeof value === "object" && value !== null && ["start", "selftest", "case", "done", "error"].includes((value as { type?: unknown }).type as string);

/**
 * Marks a live run as ended early (unless it already has a result or an error).
 * @param message - why it ended.
 * @returns the state updater.
 */
const endedEarly = (message: string) => (current: LiveRun | null) => (current && !current.summary && !current.error ? { ...current, error: message } : current);

/**
 * Formats a time of day for "next run at …".
 * @param iso - ISO timestamp.
 * @returns e.g. "2:30 PM", with the day when it's not today.
 */
function timeOfDay(iso: string): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return date.toDateString() === new Date().toDateString() ? time : `${date.toLocaleDateString("en-US", { weekday: "short" })} ${time}`;
}

/**
 * Why a run can't start now, in plain words.
 * @param status - the limit status.
 * @returns the sentence, or null when a run can start.
 */
function blockedReason(status: EvalGateStatus): string | null {
  if (status.reason === "running") return "A run is in progress right now. Results will show here when it's done.";
  if (status.reason === "too_soon" && status.nextAvailableAt) return `The next run is available at ${timeOfDay(status.nextAvailableAt)} (one every ${EVAL_RUN_LIMITS.minutesBetweenRuns} minutes).`;
  if (status.reason === "daily_limit") return `Today's ${EVAL_RUN_LIMITS.runsPerDay} runs are used up. The next run is available after midnight UTC.`;
  return null;
}

/**
 * The status line of a run.
 * @param summary - the run.
 * @returns e.g. "12 of 13 passed".
 */
const passedText = (summary: EvalRunSummary) => `${summary.passed} of ${summary.total} passed`;

/** One line in the overview's "About the data", opening the dialog. */
export function EvalQualityRow() {
  const [data, setData] = useState<LatestRun | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  /**
   * Loads the last run and the limit status (with a timeout); a failure shows "Couldn't load".
   * @param signal - cancels the request (e.g. on unmount).
   */
  const load = useCallback(
    (signal?: AbortSignal) =>
      fetchJson<LatestRun>("/api/evals/latest", { signal }).then(
        (latest) => {
          setData(latest);
          setFailed(false);
        },
        () => {
          if (!signal?.aborted) setFailed(true);
        },
      ),
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // While someone's run is in progress (and this browser isn't streaming it), check back now and then.
  useEffect(() => {
    if (!data?.status.running || open) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [data?.status.running, open, load]);

  const latest = data?.latest ?? null;
  const summaryText = failed
    ? "Couldn't load"
    : !data
      ? "…"
      : data.status.running
        ? "Running now…"
        : latest
          ? `${latest.passed}/${latest.total} passed · ${relativeTime(latest.finishedAt)}`
          : "Not run yet";
  return (
    <>
      <div className="col-span-2 -mx-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`flex w-full items-center justify-between gap-2 rounded-md px-1 text-left transition hover:bg-white/5 ${FOCUS_RING}`}
          aria-haspopup="dialog"
        >
          <span>Answer quality</span>
          <span className="flex items-center gap-1 text-right text-slate-300">
            {latest && !data?.status.running && <span aria-hidden="true">{latest.passed === latest.total ? "✅" : "⚠️"}</span>}
            {summaryText}
            <span aria-hidden="true" className="text-slate-500">›</span>
          </span>
        </button>
      </div>
      {open && (
        <EvalRunDialog
          data={data}
          onClose={() => {
            setOpen(false);
            void load();
          }}
          onFinished={() => void load()}
        />
      )}
    </>
  );
}

/** Props for {@link EvalRunDialog}. */
interface EvalRunDialogProps {
  data: LatestRun | null;
  onClose: () => void;
  /** Called when a run started here ends, so the overview line refreshes. */
  onFinished: () => void;
}

/** The dialog: what the evals are, the last run, and the live run. */
function EvalRunDialog({ data, onClose, onFinished }: EvalRunDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [live, setLive] = useState<LiveRun | null>(null);
  const [starting, setStarting] = useState(false);
  const [refused, setRefused] = useState<{ message: string; status: EvalGateStatus | null } | null>(null);
  /** "Run evals" first asks for confirmation and lists the limits; only "Yes, start" runs. */
  const [confirming, setConfirming] = useState(false);

  /** Cancels this dialog's run stream when the dialog closes (the run itself goes on, server-side). */
  const stream = useRef<AbortController | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => stream.current?.abort();
  }, []);

  /**
   * Starts a run and streams its progress (S3): a timeout until the run answers, then an
   * inactivity watchdog between progress lines. A refusal (limits) or a failure to start is
   * shown in the footer; a stream that ends early says why (dropped, stalled, unreadable).
   */
  const run = async () => {
    setConfirming(false);
    setStarting(true);
    setRefused(null);
    const controller = new AbortController();
    stream.current = controller;
    const startTimer = setTimeout(() => controller.abort(), START_TIMEOUT_MS);
    let streaming = false;
    try {
      const res = await fetch("/api/evals/run", { method: "POST", signal: controller.signal });
      clearTimeout(startTimer);
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string; hint?: string }; status?: EvalGateStatus } | null;
        setRefused({ message: [body?.error?.message, body?.error?.hint].filter(Boolean).join(" ") || EVAL_COPY.couldNotStart, status: body?.status ?? null });
        return;
      }
      streaming = true;
      setLive(EMPTY_LIVE_RUN);
      const result = await readNdjson(
        res.body,
        (value) => {
          if (isRunEvent(value)) setLive((current) => applyEvent(current ?? EMPTY_LIVE_RUN, value));
        },
        IDLE_TIMEOUT_MS,
      );
      setLive(endedEarly(result.ended === "idle" ? EVAL_COPY.stalled : result.malformed > 0 ? EVAL_COPY.unreadable : EVAL_COPY.dropped));
    } catch {
      setLive(endedEarly(EVAL_COPY.dropped));
      if (!streaming) setRefused({ message: EVAL_COPY.noConnection, status: null });
    } finally {
      clearTimeout(startTimer);
      if (stream.current === controller) stream.current = null;
      setStarting(false);
      onFinished();
    }
  };

  const status = refused?.status ?? data?.status ?? null;
  const isRunningHere = Boolean(live && !live.summary && !live.error);
  // While this browser streams a run, the footer talks about that run; otherwise it says when the next one is possible.
  const blocked = isRunningHere ? null : status ? blockedReason(status) : null;
  const shown = live?.summary ?? (live ? null : (data?.latest ?? null));

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      className="m-auto w-[min(34rem,calc(100vw-2rem))] max-h-[min(44rem,calc(100dvh-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-[#0e1428] p-0 text-slate-200 shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      aria-labelledby="eval-dialog-title"
    >
      <div className="flex max-h-[inherit] flex-col">
        <header className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
          <div>
            <h2 id="eval-dialog-title" className="text-base font-semibold text-slate-100">Answer quality</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              {data?.caseCount ?? "A set of"} test questions whose right answers we know from our own data. Each answer is checked by code (numbers, rankings,
              honesty about weak data) and by an independent AI judge. A run takes 1–2 minutes.
            </p>
          </div>
          <button type="button" onClick={() => ref.current?.close()} className={`rounded-md px-2 py-1 text-slate-400 transition hover:bg-white/5 hover:text-slate-200 ${FOCUS_RING}`} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {confirming ? (
            <ConfirmRun runsLeftToday={status?.runsLeftToday ?? EVAL_RUN_LIMITS.runsPerDay} />
          ) : live ? (
            <LiveProgress live={live} />
          ) : shown ? (
            <RunDetails summary={shown} />
          ) : (
            <p className="text-sm text-slate-400">No run has been saved yet. Start the first one below.</p>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-3">
          <p className="min-w-0 flex-1 text-[11px] leading-snug text-slate-400">
            {confirming
              ? "Start the run?"
              : (refused?.message ??
                (isRunningHere
                  ? "You can close this window. The run keeps going and its results will show up here."
                  : blocked ?? (status ? `Shared limit: one run every ${EVAL_RUN_LIMITS.minutesBetweenRuns} minutes, ${status.runsLeftToday} of ${EVAL_RUN_LIMITS.runsPerDay} left today.` : "")))}
          </p>
          {confirming ? (
            <span className="flex gap-2">
              <button type="button" onClick={() => setConfirming(false)} className={`rounded-lg px-3.5 py-1.5 text-sm text-slate-300 transition hover:bg-white/5 ${FOCUS_RING}`}>
                Cancel
              </button>
              <button type="button" onClick={() => void run()} className={`rounded-lg bg-sky-500/90 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-sky-400 ${FOCUS_RING}`}>
                Yes, start the run
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={starting || isRunningHere || Boolean(blocked) || Boolean(live?.summary)}
              className={`rounded-lg bg-sky-500/90 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-sky-400 disabled:bg-white/10 disabled:text-slate-400 ${FOCUS_RING}`}
            >
              {starting ? "Starting…" : isRunningHere ? "Running…" : live?.summary ? "Done ✓" : "Run evals…"}
            </button>
          )}
        </footer>
      </div>
    </dialog>
  );
}

/**
 * The confirmation step before a run: what it does and the shared limits, in plain words.
 * @param props.runsLeftToday - runs still possible today (for everyone together).
 */
function ConfirmRun({ runsLeftToday }: { runsLeftToday: number }) {
  const { minutesBetweenRuns, runsPerDay } = EVAL_RUN_LIMITS;
  return (
    <div className="space-y-3 text-sm">
      <h3 className="font-medium text-slate-100">Before you start</h3>
      <ul className="list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-slate-300">
        <li>
          Runs are <strong>shared by everyone</strong> using Sneakoscope: one every {minutesBetweenRuns} minutes and {runsPerDay} per day
          (the count resets at midnight UTC). <strong>{runsLeftToday} of {runsPerDay}</strong> left today.
        </li>
        <li>Starting uses one of today&apos;s runs, even if you close this window or the run fails.</li>
        <li>After this run, nobody can start another one for {minutesBetweenRuns} minutes.</li>
        <li>It takes 1–2 minutes and asks the agent every test question for real (paid AI calls).</li>
        <li>You can close this window at any time. The run keeps going, and its result replaces the last run shown here, for everyone.</li>
      </ul>
    </div>
  );
}

/** A saved run: totals, judge, model, and each case. */
function RunDetails({ summary }: { summary: EvalRunSummary }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-2xl font-semibold tabular-nums text-slate-100">
          {summary.passed}/{summary.total}
        </span>
        <span className="text-sm text-slate-300">{passedText(summary)}</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs text-slate-400">
        <dt>When</dt>
        <dd className="text-slate-300">
          {new Date(summary.finishedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · from the {summary.trigger === "ui" ? "app" : "command line"} · {summary.seconds < 120 ? `${summary.seconds} s` : `${Math.round(summary.seconds / 6) / 10} min`}
        </dd>
        <dt>Answering model</dt>
        <dd className="text-slate-300">{summary.model}</dd>
        <dt>Judge</dt>
        <dd className="text-slate-300">
          {summary.judge
            ? `${summary.judge} · ${summary.judgeReliable ? "reliable ✓ (graded every planted test answer right and never contradicted itself)" : "unreliable ⚠️ (missed a planted test answer or contradicted itself, so its scores are a hint only)"}`
            : "none this run (code checks only)"}
        </dd>
      </dl>
      <CaseList cases={summary.cases.map((c) => ({ caseId: c.caseId, title: c.title }))} done={Object.fromEntries(summary.cases.map((c) => [c.caseId, c]))} finished />
    </div>
  );
}

/** A run in progress (or just finished) in this browser. */
function LiveProgress({ live }: { live: LiveRun }) {
  const count = Object.keys(live.done).length;
  const total = live.cases.length;
  return (
    <div className="space-y-3">
      {live.summary ? (
        <RunDetails summary={live.summary} />
      ) : (
        <>
          <div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>{total ? `${count} of ${total} questions checked` : "Starting…"}</span>
              {live.selfTest && <span>Judge self-test: {live.selfTest.correct}/{live.selfTest.total}</span>}
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={total || 1} aria-valuenow={count}>
              <div className="h-full rounded-full bg-sky-400 transition-[width] duration-500" style={{ width: `${total ? (count / total) * 100 : 3}%` }} />
            </div>
          </div>
          {live.error && <p className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">{live.error}</p>}
          <CaseList cases={live.cases} done={live.done} finished={Boolean(live.error)} />
        </>
      )}
    </div>
  );
}

/** Each case with its state: waiting, passed, or failed (with the failed checks). */
function CaseList({ cases, done, finished }: { cases: { caseId: string; title: string }[]; done: Record<string, CaseOutcome>; finished: boolean }) {
  return (
    <ul className="divide-y divide-white/[0.05] rounded-xl border border-white/[0.06] bg-white/[0.02]" aria-live="polite">
      {cases.map((c) => {
        const outcome = done[c.caseId];
        return (
          <li key={c.caseId} className="flex items-start gap-2.5 px-3 py-1.5 text-xs">
            <span aria-hidden="true" className="w-4 shrink-0 text-center">
              {outcome ? (outcome.pass ? "✅" : "❌") : finished ? "–" : <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-slate-500 motion-reduce:animate-none" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className={outcome ? "text-slate-200" : "text-slate-400"}>{c.title}</span>
              <span className="sr-only">{outcome ? (outcome.pass ? " passed" : " failed") : " waiting"}</span>
              {outcome && !outcome.pass && <span className="mt-0.5 block text-[11px] text-rose-300/90">Failed: {outcome.failed.join(", ")}</span>}
            </span>
            {outcome && <span className="shrink-0 tabular-nums text-slate-500">{outcome.seconds}s</span>}
          </li>
        );
      })}
    </ul>
  );
}
