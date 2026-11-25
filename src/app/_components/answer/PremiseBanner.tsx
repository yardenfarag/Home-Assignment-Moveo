/**
 * Shows the CODE-decided premise verdict (G5): a clear heads-up when the
 * question assumed the wrong level, a quiet confirmation when it was right.
 */
import type { PremiseCheck } from "@/core/agent/answerSchema";
import { hubName } from "@/core/api/progressLabels";
import { HAZARD_UI, LEVEL_UI } from "../../_lib/labels";

/** Props for {@link PremiseBanner}. */
interface PremiseBannerProps {
  check: PremiseCheck;
}

/** Renders the premise verdict. */
export function PremiseBanner({ check }: PremiseBannerProps) {
  const subject = `${hubName(check.hubId)}'s ${check.hazard ? `${HAZARD_UI[check.hazard].label.toLowerCase()} ` : ""}risk`;
  if (check.holds) {
    return (
      <p className="text-xs text-emerald-300/90">
        ✓ Checked against the data: {subject} is {LEVEL_UI[check.actualLevel].label}.
      </p>
    );
  }
  return (
    <div role="note" className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
      <span className="font-medium">Heads-up:</span> {subject} isn&apos;t {LEVEL_UI[check.claimedLevel].label} — the data says{" "}
      <span className="font-medium">{LEVEL_UI[check.actualLevel].label}</span>.
    </div>
  );
}
