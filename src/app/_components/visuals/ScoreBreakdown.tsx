/**
 * Score breakdown (U3b): WHERE a hub's score comes from, in one strip —
 * each hazard's share of the weighted average plus the worst-hazard boost (the mix is
 * `OVERALL_MIX` in core/scoring/config.ts). All numbers come from the explain_hub_score
 * tool (computed in code).
 */
import type { ExplainHubScoreOutput } from "@/core/agent/tools/explainHubScore";
import { HAZARD_UI } from "../../_lib/labels";
import { LevelChip } from "../LevelChip";

/**
 * The striped fill that marks the worst-hazard boost (the bar and its legend swatch use the same one).
 * @param color - the worst hazard's color.
 * @returns a CSS background.
 */
const boostStripe = (color: string) => `repeating-linear-gradient(135deg, ${color}, ${color} 4px, transparent 4px, transparent 8px)`;

/** Props for {@link ScoreBreakdown}. */
interface ScoreBreakdownProps {
  data: ExplainHubScoreOutput;
}

/** Renders the score breakdown strip and its legend. */
export function ScoreBreakdown({ data }: ScoreBreakdownProps) {
  const { contributions, worstHazardBoost, calculation } = data.formula;
  const total = contributions.reduce((sum, c) => sum + c.points, 0) + worstHazardBoost;
  const pct = (points: number) => `${total > 0 ? (points / total) * 100 : 0}%`;
  const scores = Object.fromEntries(data.hazards.map((h) => [h.hazard, h]));
  const worst = HAZARD_UI[data.topHazard];

  return (
    <figure className="space-y-3">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-slate-200">Where {data.hub}&apos;s score comes from</span>
        <LevelChip level={data.level} score={data.overallScore} />
      </figcaption>

      <div className="flex h-4 w-full overflow-hidden rounded-full bg-white/5" role="img" aria-label={`Score breakdown: ${calculation}`}>
        {contributions
          .filter((c) => c.points > 0)
          .map((c) => (
            <div
              key={c.hazard}
              style={{ width: pct(c.points), background: HAZARD_UI[c.hazard].color }}
              title={`${HAZARD_UI[c.hazard].label}: +${c.points}`}
            />
          ))}
        <div
          style={{
            width: pct(worstHazardBoost),
            background: boostStripe(worst.color),
          }}
          title={`Worst-hazard boost (${worst.label}): +${worstHazardBoost}`}
        />
      </div>

      <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
        {contributions.map((c) => (
          <li key={c.hazard} className="flex items-center gap-2 text-slate-300">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: HAZARD_UI[c.hazard].color }} aria-hidden="true" />
            <span className="flex-1">{HAZARD_UI[c.hazard].label}</span>
            <span className="tabular-nums text-slate-400">score {scores[c.hazard].score}</span>
            <span className="w-12 text-right tabular-nums text-slate-200">+{c.points}</span>
          </li>
        ))}
        <li className="flex items-center gap-2 text-slate-300">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: boostStripe(worst.color) }} aria-hidden="true" />
          <span className="flex-1">Worst-hazard boost ({worst.label})</span>
          <span className="w-12 text-right tabular-nums text-slate-200">+{worstHazardBoost}</span>
        </li>
      </ul>
      <p className="font-mono text-[11px] text-slate-500">Overall = {calculation}</p>
    </figure>
  );
}
