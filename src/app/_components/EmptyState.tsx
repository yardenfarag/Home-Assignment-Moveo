/**
 * First screen: the Sneakoscope mark, a plain-language intro, and the brief's example questions.
 */
import { EXAMPLE_QUESTIONS } from "../_lib/labels";
import { FOCUS_RING } from "../_lib/styles";
import { SneakoscopeIcon } from "./SneakoscopeIcon";

/** Props for {@link EmptyState}. */
interface EmptyStateProps {
  onAsk: (question: string) => void;
  /** Number of scored hubs from the live data (null while loading) — never hard-coded. */
  hubCount: number | null;
}

/** Renders the welcome (Yarden's copy) and example questions. */
export function EmptyState({ onAsk, hubCount }: EmptyStateProps) {
  return (
    <div className="mx-auto max-w-xl space-y-6 py-10 text-center">
      <div className="space-y-3">
        <SneakoscopeIcon size={72} glowing className="mx-auto drop-shadow-[0_0_24px_rgba(251,191,36,0.25)]" />
        <h2 className="text-xl font-medium text-slate-100">Weather risk across our hubs</h2>
        <p className="text-sm leading-relaxed text-slate-400">
          Ask me about weather risk across our {hubCount ? `${hubCount} ` : ""}hubs. I can rank them, compare them, look at past weather,
          or explain a hub&apos;s score. All numbers come straight from the data, and I tell you how confident I am whenever the data allows it.
        </p>
      </div>
      <ul className="grid gap-2 text-left sm:grid-cols-2">
        {EXAMPLE_QUESTIONS.map((question) => (
          <li key={question}>
            <button
              type="button"
              onClick={() => onAsk(question)}
              className={`glass h-full w-full rounded-xl px-4 py-3 text-sm text-slate-200 transition hover:border-sky-300/30 ${FOCUS_RING}`}
            >
              {question}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
