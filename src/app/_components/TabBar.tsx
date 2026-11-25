/**
 * Bottom tabs for screens narrower than 1280 px (Step 14, D125): one panel at a time
 * (Chats · Chat · Overview). Desktop shows all three panels side by side instead.
 */

/** The three panels. */
export type ShellTab = "chats" | "chat" | "overview";

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

/** Renders the tab bar. */
export function TabBar({ tab, onChange, className = "" }: TabBarProps) {
  return (
    <nav className={`shrink-0 border-t border-white/[0.07] bg-slate-950/80 backdrop-blur ${className}`} aria-label="Panels">
      <div role="tablist" className="mx-auto flex max-w-md">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => onChange(t.id)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400/60 ${
              tab === t.id ? "text-slate-50" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            <span aria-hidden="true" className="text-base">
              {t.icon}
            </span>
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
