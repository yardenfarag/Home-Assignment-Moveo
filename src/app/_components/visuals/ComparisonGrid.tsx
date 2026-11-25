/**
 * Comparison grid (U3b): hubs × hazards at a glance — each cell is a score
 * with its level color AND text. Numbers come from the compare_hubs tool.
 */
import type { CompareHubsOutput } from "@/core/agent/tools/compareHubs";
import type { Hazard } from "@/core/scoring/types";
import { HAZARD_UI, LEVEL_UI } from "../../_lib/labels";
import { LevelChip } from "../LevelChip";

/** Props for {@link ComparisonGrid}. */
interface ComparisonGridProps {
  data: CompareHubsOutput;
}

/** Renders the comparison table. */
export function ComparisonGrid({ data }: ComparisonGridProps) {
  const hazards = Object.keys(data.hubs[0]?.hazards ?? {}) as Hazard[];
  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-medium text-slate-200">Side by side</figcaption>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-sm">
          <thead>
            <tr>
              <th className="text-left text-xs font-normal text-slate-400" scope="col">
                Hazard
              </th>
              {data.hubs.map((hub) => (
                <th key={hub.hubId} className="text-left text-xs font-medium text-slate-200" scope="col">
                  {hub.hub}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hazards.map((hazard) => (
              <tr key={hazard}>
                <th scope="row" className="whitespace-nowrap text-left text-xs font-normal text-slate-300">
                  <span aria-hidden="true">{HAZARD_UI[hazard].icon} </span>
                  {HAZARD_UI[hazard].label}
                </th>
                {data.hubs.map((hub) => {
                  const cell = hub.hazards[hazard];
                  const ui = LEVEL_UI[cell.level];
                  return (
                    <td
                      key={hub.hubId}
                      className="rounded-md border px-2 py-1 tabular-nums"
                      style={{ background: ui.bg, borderColor: ui.border }}
                      title={`${cell.confidenceReason} (rank ${cell.rankAmongAll} of ${data.totalHubs})`}
                    >
                      <span className="font-medium" style={{ color: ui.text }}>
                        {cell.score}
                      </span>{" "}
                      <span className="text-xs text-slate-400">{ui.label}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <th scope="row" className="text-left text-xs font-medium text-slate-200">
                Overall
              </th>
              {data.hubs.map((hub) => (
                <td key={hub.hubId} className="px-1 py-1">
                  <LevelChip level={hub.level} score={hub.overallScore} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </figure>
  );
}
