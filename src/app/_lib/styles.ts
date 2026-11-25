/**
 * @module app/_lib/styles
 *
 * Class strings shared by many components (one place to change them). Tailwind scans this
 * file, so the classes in these strings are generated like any other.
 */

/** The keyboard focus ring every button and link uses (visible only for keyboard focus). */
export const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60";

/** How a control looks while it can't be used yet (paired with `aria-disabled`, so its tooltip still shows). */
export const WAITING = "aria-disabled:cursor-not-allowed aria-disabled:opacity-50";
