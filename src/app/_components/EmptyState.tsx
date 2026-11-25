/**
 * First screen (U4 empty state): a one-line intro and the brief's example questions.
 */
import { EXAMPLE_QUESTIONS } from "../_lib/labels";

/** Props for {@link EmptyState}. */
interface EmptyStateProps {
  onAsk: (question: string) => void;
}

/** Renders the welcome and example questions. */
export function EmptyState({ onAsk }: EmptyStateProps) {
  return (
    <div className="mx-auto max-w-xl space-y-6 py-10 text-center">
      <div className="space-y-2">
        <p className="text-4xl" aria-hidden="true">
          🐱
        </p>
        <h2 className="text-xl font-medium text-slate-100">Which hubs should we protect first?</h2>
        <p className="text-sm text-slate-400">
          Ask about weather risk at our 36 hubs — rankings, comparisons, history, or why a hub scores the way it does. Every number comes
          from the data, and I&apos;ll tell you when the data is unsure.
        </p>
      </div>
      <ul className="grid gap-2 text-left sm:grid-cols-2">
        {EXAMPLE_QUESTIONS.map((question) => (
          <li key={question}>
            <button
              type="button"
              onClick={() => onAsk(question)}
              className="glass h-full w-full rounded-xl px-4 py-3 text-sm text-slate-200 transition hover:border-sky-300/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
            >
              {question}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
