/**
 * Bottom panel switcher for screens narrower than 1280 px (Step 14, D125): one panel at a time
 * (Chats · Chat · Overview). Desktop shows all three panels side by side instead.
 *
 * Plain buttons with `aria-current` (S7), not ARIA tabs: the panels are whole regions of the
 * page, each with its own heading, so the full tabs pattern (tabpanels, arrow keys, roving
 * focus) would promise behavior a desktop layout can't keep.
 */
import { FOCUS_RING } from "../_lib/styles";

/** The three panels. */
export type ShellTab = "chats" | "chat" | "overview";

/** The switcher's buttons, in order. */
const TABS: { id: ShellTab; label: string; icon: string }[] = [
  { id: "chats", label: "Chats", icon: "🗂️" },
  { id: "chat", label: "Chat", icon: "💬" },
  { id: "overview", label: "Overview", icon: "📊" },
];

/** Props for {@link TabBar}. */
interface TabBarProps {
  tab: ShellTab;
  onChange: (tab: ShellTab) => void;
  /** Layout classes from the shell (hidden on desktop). */
  className?: string;
}

/** Renders the panel switcher. */
export function TabBar({ tab, onChange, className = "" }: TabBarProps) {
  return (
    <nav className={`shrink-0 border-t border-white/[0.07] bg-slate-950/80 backdrop-blur ${className}`} aria-label="Panels">
      <ul className="mx-auto flex max-w-md">
        {TABS.map((t) => (
          <li key={t.id} className="flex flex-1">
            <button
              type="button"
              aria-current={tab === t.id ? "true" : undefined}
              onClick={() => onChange(t.id)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition focus-visible:ring-inset ${FOCUS_RING} ${
                tab === t.id ? "text-slate-50" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <span aria-hidden="true" className="text-base">
                {t.icon}
              </span>
              {t.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
