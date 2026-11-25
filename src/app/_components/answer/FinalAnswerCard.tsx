/**
 * The validated answer (U2): premise verdict, text, purposeful visuals,
 * confidence, recommendation, assumptions & limits, how it was made, follow-ups.
 */
import type { FinalAnswer } from "@/core/agent/answerSchema";
import { progressLabel } from "@/core/api/progressLabels";
import type { UnitSystem } from "@/core/utils/units";
import { CONFIDENCE_UI } from "../../_lib/labels";
import { pickVisuals, type AnswerVisual } from "../../_lib/toolResults";
import { ComparisonGrid } from "../visuals/ComparisonGrid";
import { RankedList } from "../visuals/RankedList";
import { ScoreBreakdown } from "../visuals/ScoreBreakdown";
import { SeasonalityStrip } from "../visuals/SeasonalityStrip";
import { Disclosure } from "./Disclosure";
import { Markdown } from "./Markdown";
import { PremiseBanner } from "./PremiseBanner";
import { RecommendationBox } from "./RecommendationBox";

/** Props for {@link FinalAnswerCard}. */
interface FinalAnswerCardProps {
  answer: FinalAnswer;
  units: UnitSystem;
  /** Ask a follow-up question. */
  onAsk: (question: string) => void;
}

/** Renders one visual. */
function Visual({ visual, units }: { visual: AnswerVisual; units: UnitSystem }) {
  switch (visual.kind) {
    case "breakdown":
      return <ScoreBreakdown data={visual.data} />;
    case "grid":
      return <ComparisonGrid data={visual.data} />;
    case "seasonality":
      return <SeasonalityStrip data={visual.data} units={units} />;
    case "ranking":
      return <RankedList data={visual.data} />;
  }
}

/** Renders the final answer card. */
export function FinalAnswerCard({ answer, units, onAsk }: FinalAnswerCardProps) {
  const visuals = pickVisuals(answer);
  const steps = [...new Set(answer.meta.toolCalls.map((c) => progressLabel(c.tool, c.input).replace(/…$/, "")))];
  const caveats = [...answer.assumptions, ...answer.limitations];

  return (
    <div className="space-y-4">
      {answer.premiseCheck && <PremiseBanner check={answer.premiseCheck} />}
      <Markdown text={answer.answer} />

      {visuals.map((visual) => (
        <div key={visual.key} className="rounded-xl border border-white/5 bg-black/15 p-4">
          <Visual visual={visual} units={units} />
        </div>
      ))}

      {answer.recommendation && <RecommendationBox recommendation={answer.recommendation} />}

      {answer.confidence && (
        <p className="flex items-center gap-2 text-xs text-slate-400" title="Computed by code from data completeness and whether the sources agree">
          <span className="h-2 w-2 rounded-full" style={{ background: CONFIDENCE_UI[answer.confidence].dot }} aria-hidden="true" />
          {CONFIDENCE_UI[answer.confidence].label}
        </p>
      )}

      {(caveats.length > 0 || steps.length > 0) && (
        <div className="space-y-2">
          {caveats.length > 0 && (
            <Disclosure summary={`Assumptions & limits (${caveats.length})`}>
              <ul className="list-disc space-y-1 pl-5 text-[13px] leading-snug">
                {caveats.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </Disclosure>
          )}
          {steps.length > 0 && (
            <Disclosure summary="How I got this">
              <ul className="space-y-1 text-[13px]">
                {steps.map((step) => (
                  <li key={step}>✓ {step}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-slate-500">
                Every number above was checked against these results before you saw it
                {answer.meta.retried ? " (the first draft failed that check and was corrected)" : ""}.
              </p>
              {answer.meta.warnings.length > 0 && (
                <p className="mt-1 text-xs text-amber-300/80">
                  Note: {answer.meta.warnings.length} number{answer.meta.warnings.length > 1 ? "s" : ""} in the text could not be traced to
                  the data tools — treat {answer.meta.warnings.length > 1 ? "them" : "it"} with care.
                </p>
              )}
            </Disclosure>
          )}
        </div>
      )}

      {answer.followUpSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Suggested follow-up questions">
          {answer.followUpSuggestions.map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => onAsk(question)}
              className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300 transition hover:border-sky-300/40 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
            >
              {question}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
