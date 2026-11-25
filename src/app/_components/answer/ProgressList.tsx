/**
 * Live progress lines while the agent works ("Breaking down Dallas's risk score…").
 */
import type { SneakoscopeDataParts } from "@/core/api/chatStream";

/** Props for {@link ProgressList}. */
interface ProgressListProps {
  items: SneakoscopeDataParts["progress"][];
}

/** Renders the progress lines with a spinner or a check. */
export function ProgressList({ items }: ProgressListProps) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-1 text-xs text-slate-400" aria-label="What I'm doing">
      {items.map((item, index) => (
        <li key={`${item.label}-${index}`} className="flex items-center gap-2">
          {item.status === "running" ? (
            <span className="h-3 w-3 animate-spin rounded-full border border-slate-500 border-t-sky-300 motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <span aria-hidden="true" className={item.status === "done" ? "text-emerald-400" : "text-amber-400"}>
              {item.status === "done" ? "✓" : "!"}
            </span>
          )}
          <span>
            {item.label.replace(/…$/, item.status === "running" ? "…" : "")}
            {item.status === "failed" && " — couldn't get this one"}
          </span>
        </li>
      ))}
    </ul>
  );
}
