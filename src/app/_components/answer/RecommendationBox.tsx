/**
 * Decision-support box (D8): stance, reasons, what would change it, and the
 * fixed disclaimer added by code.
 */
import type { FinalAnswer } from "@/core/agent/answerSchema";

/** Friendly names for each stance. */
const STANCE_LABEL: Record<NonNullable<FinalAnswer["recommendation"]>["stance"], string> = {
  recommend: "Recommend",
  lean_yes: "Leaning yes",
  lean_no: "Leaning no",
  not_recommended: "Not recommended",
  cannot_say: "Can't say yet",
};

/** Props for {@link RecommendationBox}. */
interface RecommendationBoxProps {
  recommendation: NonNullable<FinalAnswer["recommendation"]>;
}

/** Renders the recommendation. */
export function RecommendationBox({ recommendation }: RecommendationBoxProps) {
  return (
    <section className="rounded-xl border border-indigo-300/25 bg-indigo-400/[0.07] p-4" aria-label="Recommendation">
      <p className="text-xs uppercase tracking-wide text-indigo-200/80">Recommendation · {STANCE_LABEL[recommendation.stance]}</p>
      <p className="mt-1 text-sm text-slate-100">{recommendation.summary}</p>
      {recommendation.reasons.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-slate-300">
          {recommendation.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      {recommendation.whatWouldChangeIt.length > 0 && (
        <p className="mt-2 text-xs text-slate-400">
          <span className="text-slate-300">What could change this:</span> {recommendation.whatWouldChangeIt.join(" · ")}
        </p>
      )}
      <p className="mt-3 border-t border-white/10 pt-2 text-[11px] leading-snug text-slate-500">{recommendation.disclaimer}</p>
    </section>
  );
}
