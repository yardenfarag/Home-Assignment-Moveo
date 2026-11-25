/**
 * Masthead (U1): wordmark, data freshness, the US/Metric switch (D60), new chat.
 */
import type { UnitSystem } from "@/core/utils/units";

/** Props for {@link Header}. */
interface HeaderProps {
  units: UnitSystem;
  onUnitsChange: (units: UnitSystem) => void;
  /** e.g. "36 hubs · weather through 2026-11-24" (null while loading). */
  freshness: string | null;
  onNew: () => void;
  onToggleNav: () => void;
}

/** Renders the masthead. */
export function Header({ units, onUnitsChange, freshness, onNew, onToggleNav }: HeaderProps) {
  const segment = (value: UnitSystem, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={units === value}
      onClick={() => onUnitsChange(value)}
      className={`rounded-md px-2.5 py-1 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 ${
        units === value ? "bg-white/15 text-slate-50" : "text-slate-400 hover:text-slate-200"
      }`}
    >
      {label}
    </button>
  );
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/5 px-4 py-3 sm:px-6">
      <button
        type="button"
        onClick={onToggleNav}
        className="rounded-lg border border-white/10 px-2 py-1 text-sm text-slate-300 lg:hidden"
        aria-label="Show your chats"
      >
        ☰
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="text-lg font-medium tracking-tight text-slate-50">
          <span aria-hidden="true">🦉 </span>The Daily Prophet
        </h1>
        <p className="truncate text-xs text-slate-400">Weather risk intelligence for our hubs{freshness ? ` · ${freshness}` : ""}</p>
      </div>
      <div role="radiogroup" aria-label="Units" className="flex rounded-lg border border-white/10 bg-white/5 p-0.5">
        {segment("us", "US")}
        {segment("metric", "Metric")}
      </div>
      <button
        type="button"
        onClick={onNew}
        className="hidden rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 sm:block"
      >
        + New chat
      </button>
    </header>
  );
}
