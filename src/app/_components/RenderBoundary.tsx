"use client";
/**
 * A small error boundary (S11) around parts that draw stored data — one chart, one saved
 * answer — so one odd value can't take the whole app down. It shows a friendly line instead
 * and logs the detail for us. Built on Next's `catchError` (component-level `error.js`).
 */
import { catchError, type ErrorInfo } from "next/error";
import { useEffect } from "react";
import { logUiError } from "../_lib/clientErrors";

/** Props for {@link RenderBoundary} (besides its children). */
interface RenderBoundaryProps {
  /** The friendly line shown when the children fail to draw. */
  message: string;
  /** Names the part for the console log line. */
  where: string;
}

/**
 * Logs the failure once, in the project's format (`ErrorName || message || fn || emoji`).
 * @param props.error - what was thrown.
 * @param props.where - the part that failed.
 */
function LogOnce({ error, where }: { error: unknown; where: string }) {
  useEffect(() => logUiError(error, where), [error, where]);
  return null;
}

/**
 * The fallback: a quiet, friendly line in place of the part that failed.
 * @param props - the boundary's props.
 * @param info - the caught error.
 * @returns the fallback UI.
 */
function Fallback({ message, where }: RenderBoundaryProps, { error }: ErrorInfo) {
  return (
    <p role="note" className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-400">
      <LogOnce error={error} where={where} />
      {message}
    </p>
  );
}

/** Wraps children; renders {@link Fallback} if they throw while rendering. */
export const RenderBoundary = catchError(Fallback);
