"use client";
/**
 * The friendly full-page fallback when the app itself fails to draw (B3): used by `error.tsx`
 * (inside the root layout) and `global-error.tsx` (when even the layout failed). Never shows
 * the raw error; logs it in the project's format instead.
 */
import { useEffect } from "react";
import { logUiError } from "../_lib/clientErrors";
import { FOCUS_RING } from "../_lib/styles";
import { SneakoscopeIcon } from "./SneakoscopeIcon";

/** Props for {@link ErrorScreen}. */
interface ErrorScreenProps {
  /** What was thrown (only logged). */
  error: unknown;
  /** Re-renders the page (Next's `retry`). */
  retry: () => void;
  /** Names the boundary for the log line. */
  where: string;
}

/** Renders the fallback page. */
export function ErrorScreen({ error, retry, where }: ErrorScreenProps) {
  useEffect(() => logUiError(error, where), [error, where]);
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="glass w-full max-w-md space-y-4 rounded-2xl p-6 text-center">
        <SneakoscopeIcon size={56} className="mx-auto" />
        <h1 className="text-lg font-medium text-slate-100">Something went wrong on this page. 😿</h1>
        <p className="text-sm leading-relaxed text-slate-400">It&apos;s not you. Try again, and if that doesn&apos;t help, reload the page.</p>
        <div className="flex justify-center gap-2">
          <button
            type="button"
            onClick={() => retry()}
            className={`rounded-lg bg-sky-400/90 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-sky-300 ${FOCUS_RING}`}
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className={`rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-slate-100 transition hover:bg-white/10 ${FOCUS_RING}`}
          >
            Reload the page
          </button>
        </div>
      </div>
    </main>
  );
}
