/**
 * Comparison grid (U3b): hubs × hazards at a glance — each cell is a score
 * with its level color AND text. Numbers come from the compare_hubs tool.
 * Each cell's rank and confidence reason are listed in a disclosure under the
 * table, so they're reachable by keyboard and screen readers, not only on hover (S7).
 */
import type { CompareHubsOutput } from "@/core/agent/tools/compareHubs";
import type { Hazard } from "@/core/scoring/types";
import { CONFIDENCE_UI, HAZARD_UI, LEVEL_UI } from "../../_lib/labels";
import { compareCellReason } from "../../_lib/toolResults";
import { Disclosure } from "../answer/Disclosure";
import { LevelChip } from "../LevelChip";

/** Props for {@link ComparisonGrid}. */
interface ComparisonGridProps {
  data: CompareHubsOutput;
}

/**
 * One cell's rank in words.
 * @param rank - rank among all hubs.
 * @param total - number of hubs.
 * @returns e.g. "rank 3 of 36".
 */
const rankText = (rank: number | undefined, total: number) => (rank === undefined ? "rank unknown" : `rank ${rank} of ${total}`);

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
                  const reason = compareCellReason(data, hub.hubId, hazard);
                  const rank = rankText(cell.rankAmongAll, data.totalHubs);
                  return (
                    <td
                      key={hub.hubId}
                      className="rounded-md border px-2 py-1 tabular-nums"
                      style={{ background: ui.bg, borderColor: ui.border }}
                      title={reason ? `${reason} (${rank})` : rank}
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
      <Disclosure summary="Rank and confidence per cell">
        <ul className="space-y-1.5 text-[12px] leading-snug">
          {data.hubs.flatMap((hub) =>
            hazards.map((hazard) => {
              const cell = hub.hazards[hazard];
              const reason = compareCellReason(data, hub.hubId, hazard);
              return (
                <li key={`${hub.hubId}-${hazard}`}>
                  <span className="text-slate-200">
                    {hub.hub} · {HAZARD_UI[hazard].label}
                  </span>
                  : {rankText(cell.rankAmongAll, data.totalHubs)}
                  {cell.confidence ? ` · ${CONFIDENCE_UI[cell.confidence].label}` : ""}.{reason && <span className="text-slate-400"> {reason}</span>}
                </li>
              );
            }),
          )}
        </ul>
      </Disclosure>
    </figure>
  );
}
