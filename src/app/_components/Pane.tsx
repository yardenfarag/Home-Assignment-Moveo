/**
 * A framed panel of the app shell (Step 14, D125): a title strip, a body that scrolls
 * on its own (the page itself never scrolls), and an optional pinned footer
 * (the composer, in the conversation panel).
 */
import type { ReactNode, RefObject } from "react";

/** Props for {@link Pane}. */
interface PaneProps {
  title: string;
  /** Shown at the right of the title strip (e.g. a count). */
  aside?: ReactNode;
  /** Layout classes from the shell (which breakpoints show it). */
  className?: string;
  /** Pinned below the scrolling body. */
  footer?: ReactNode;
  /** The scrolling body, e.g. to keep the newest message in view. */
  bodyRef?: RefObject<HTMLDivElement | null>;
  busy?: boolean;
  children: ReactNode;
}

/** Renders a panel. */
export function Pane({ title, aside, className = "", footer, bodyRef, busy, children }: PaneProps) {
  return (
    <section className={`glass min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl ${className}`} aria-label={title}>
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.07] px-4 py-2">
        <h2 className="text-xs font-medium uppercase tracking-wider text-slate-400">{title}</h2>
        {aside}
      </div>
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3" aria-busy={busy}>
        {children}
      </div>
      {footer && <div className="shrink-0 border-t border-white/[0.07] p-3">{footer}</div>}
    </section>
  );
}
