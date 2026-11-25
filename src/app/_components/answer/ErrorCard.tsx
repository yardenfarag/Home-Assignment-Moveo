/**
 * A soft, friendly error (A4/D76): message, what to do next, and a Try again
 * button when retrying can help.
 */
import type { ProphetDataParts } from "@/core/api/chatStream";

/** Props for {@link ErrorCard}. */
interface ErrorCardProps {
  error: ProphetDataParts["error"];
  onRetry?: () => void;
}

/** Renders the error card. */
export function ErrorCard({ error, onRetry }: ErrorCardProps) {
  return (
    <div role="alert" className="rounded-xl border border-rose-300/25 bg-rose-400/[0.07] p-4">
      <p className="text-sm text-slate-100">{error.message}</p>
      <p className="mt-1 text-sm text-slate-400">{error.hint}</p>
      {error.retryable && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-slate-100 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
        >
          Try again
        </button>
      )}
    </div>
  );
}
