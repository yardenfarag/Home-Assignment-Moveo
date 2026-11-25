/**
 * Masthead (U1): wordmark and data freshness. "New chat" lives in the chat list.
 * US units only (D126): the US/Metric switch was removed.
 */
import { SneakoscopeIcon } from "./SneakoscopeIcon";

/** Props for {@link Header}. */
interface HeaderProps {
  /** e.g. "36 hubs · weather through 2026-11-24" (null while loading). */
  freshness: string | null;
}

/** Renders the masthead (compact: the panels below get the height). */
export function Header({ freshness }: HeaderProps) {
  return (
    <header className="flex shrink-0 items-center gap-4 border-b border-white/5 px-4 py-2 sm:px-6">
      <div className="min-w-0 flex-1">
        <h1 className="flex items-center gap-2 text-lg font-medium tracking-tight text-slate-50">
          <SneakoscopeIcon size={26} />
          Sneakoscope
        </h1>
        <p className="truncate text-xs text-slate-400">Weather risk intelligence for our hubs{freshness ? ` · ${freshness}` : ""}</p>
      </div>
    </header>
  );
}
