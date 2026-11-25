/**
 * @module app/_lib/scroll
 *
 * Where the conversation panel should scroll (S9), as pure functions: follow a new answer
 * while it grows, but never past its first line, and never while the person is reading
 * further up.
 */

/** Within this many pixels of the bottom counts as "at the bottom" (still following). */
export const NEAR_BOTTOM_PX = 80;

/** Space kept above an answer's first line when it's scrolled to the top of the panel. */
export const ANSWER_TOP_GAP_PX = 12;

/** The scroll position and sizes of the panel. */
export interface ScrollView {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

/**
 * True when the panel is scrolled to (about) the bottom.
 * @param view - the panel's scroll state.
 * @returns whether the person is at the end of the conversation.
 */
export function isNearBottom(view: ScrollView): boolean {
  return view.scrollHeight - view.scrollTop - view.clientHeight <= NEAR_BOTTOM_PX;
}

/**
 * How far to scroll to follow the newest answer: to the bottom, but at most until the answer's
 * first line reaches the top of the panel (so a long answer is read from its start).
 * @param view - the panel's scroll state.
 * @param answerTop - the newest answer's offset from the top of the content, or null for none.
 * @returns the new scrollTop, or null to stay put (never scrolls up).
 */
export function followTarget(view: ScrollView, answerTop: number | null): number | null {
  const bottom = Math.max(0, view.scrollHeight - view.clientHeight);
  const target = answerTop === null ? bottom : Math.min(bottom, Math.max(0, answerTop - ANSWER_TOP_GAP_PX));
  return target > view.scrollTop + 1 ? target : null;
}
