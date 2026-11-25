/**
 * A collapsible section built on native <details> (keyboard and screen-reader
 * friendly for free).
 */
import type { ReactNode } from "react";

/** Props for {@link Disclosure}. */
interface DisclosureProps {
  summary: string;
  children: ReactNode;
}

/** Renders a collapsible section. */
export function Disclosure({ summary, children }: DisclosureProps) {
  return (
    <details className="group rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-sm">
      <summary className="cursor-pointer select-none list-none text-slate-400 transition-colors hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 rounded">
        <span className="mr-1 inline-block transition-transform group-open:rotate-90" aria-hidden="true">
          ›
        </span>
        {summary}
      </summary>
      <div className="mt-2 text-slate-300">{children}</div>
    </details>
  );
}
