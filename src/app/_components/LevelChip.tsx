/**
 * A small pill showing a risk level — color AND text, never color alone.
 */
import type { RiskLevel } from "@/core/scoring/types";
import { LEVEL_UI } from "../_lib/labels";

/** Props for {@link LevelChip}. */
interface LevelChipProps {
  level: RiskLevel;
  /** Optional score to show before the label, e.g. "72.4 · High". */
  score?: number;
}

/** Renders a level pill. */
export function LevelChip({ level, score }: LevelChipProps) {
  const ui = LEVEL_UI[level];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums"
      style={{ color: ui.text, background: ui.bg, borderColor: ui.border }}
    >
      {score !== undefined && <span>{score}</span>}
      {score !== undefined && <span aria-hidden="true">·</span>}
      {ui.label}
    </span>
  );
}
