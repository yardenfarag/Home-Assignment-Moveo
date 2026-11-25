/**
 * Ranked list (U3b): for rankings the list IS the visual — rank, hub, a thin
 * bar, the score and its level. Numbers come from the rank_hubs tool.
 */
import type { RankHubsOutput } from "@/core/agent/tools/rankHubs";
import { HAZARD_UI } from "../../_lib/labels";
import { LevelChip } from "../LevelChip";

/** Props for {@link RankedList}. */
interface RankedListProps {
  data: RankHubsOutput;
}

/** Renders the ranking. */
export function RankedList({ data }: RankedListProps) {
  const what = data.metric === "overall" ? "Overall risk" : HAZARD_UI[data.metric].label;
  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-medium text-slate-200">
        {what}
        {data.region ? ` · ${data.region}` : ""} <span className="font-normal text-slate-500">(rank among all hubs)</span>
      </figcaption>
      <ol className="space-y-1.5">
        {data.results.map((row) => (
          <li key={row.hubId} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 text-sm">
            <span className="text-right tabular-nums text-slate-500">#{row.rankAmongAll}</span>
            <div className="min-w-0">
              <div className="truncate text-slate-200">{row.hub}</div>
              <div className="mt-1 h-1.5 rounded-full bg-white/5">
                <div className="h-1.5 rounded-full bg-indigo-300/70" style={{ width: `${row.score}%` }} />
              </div>
            </div>
            <LevelChip level={row.level} score={row.score} />
          </li>
        ))}
      </ol>
    </figure>
  );
}
