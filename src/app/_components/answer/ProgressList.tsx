/**
 * Live progress lines while the agent works ("Breaking down Dallas's risk score…").
 * Once the turn is over, a step that never finished says so instead of spinning forever (S1).
 */
import type { SneakoscopeDataParts } from "@/core/api/chatStream";
import { withoutEllipsis } from "../../_lib/labels";

/** Props for {@link ProgressList}. */
interface ProgressListProps {
  items: SneakoscopeDataParts["progress"][];
  /** True while the turn is still running (false: leftover "running" steps didn't finish). */
  active: boolean;
}

/** Renders the progress lines with a spinner, a check, or a mark for steps that failed or didn't finish. */
export function ProgressList({ items, active }: ProgressListProps) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-1 text-xs text-slate-400" aria-label="What I'm doing">
      {items.map((item, index) => {
        const status = item.status === "running" && !active ? "unfinished" : item.status;
        return (
          <li key={`${item.label}-${index}`} className="flex items-center gap-2">
            {status === "running" ? (
              <span className="h-3 w-3 animate-spin rounded-full border border-slate-500 border-t-sky-300 motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <span aria-hidden="true" className={status === "done" ? "text-emerald-400" : status === "failed" ? "text-amber-400" : "text-slate-500"}>
                {status === "done" ? "✓" : status === "failed" ? "!" : "–"}
              </span>
            )}
            <span>
              {status === "running" ? item.label : withoutEllipsis(item.label)}
              {status === "failed" && " — couldn't get this one"}
              {status === "unfinished" && " — didn't finish"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
