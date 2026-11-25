"use client";
/**
 * @module app/_lib/useConversationScroll
 *
 * Keeps the conversation panel scrolled sensibly (S9): a new question scrolls to the bottom;
 * while an answer grows the panel follows it, but stops once the answer's first line reaches
 * the top (long answers are read from the start, not the end); and nothing moves while the
 * person has scrolled up to read. Decisions come from the pure functions in `scroll.ts`.
 */
import { useEffect, useRef, type RefObject } from "react";
import type { SneakoscopeUIMessage } from "@/core/api/chatStream";
import { followTarget, isNearBottom } from "./scroll";

/** Marks the newest answer (only while it's the last message), so the panel can find its top. */
export const LATEST_ANSWER_ATTR = "data-latest-answer";

/**
 * The newest answer's offset from the top of the scrolling content.
 * @param panel - the scrolling element.
 * @returns the offset in pixels, or null when there's no newest answer.
 */
function latestAnswerTop(panel: HTMLElement): number | null {
  const answer = panel.querySelector(`[${LATEST_ANSWER_ATTR}]`);
  if (!answer) return null;
  return answer.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop;
}

/**
 * Follows the conversation as it grows.
 * @param panelRef - the conversation panel's scrolling body.
 * @param messages - the chat messages (each change re-checks the position).
 * @param status - the chat status (the "working" line appears on a status change, not a message change).
 * @param chatKey - changes when another chat is opened or a new chat starts (resets following).
 */
export function useConversationScroll(panelRef: RefObject<HTMLDivElement | null>, messages: SneakoscopeUIMessage[], status: string, chatKey: number): void {
  const following = useRef(true);
  const lastCount = useRef(0);
  const lastChatKey = useRef(chatKey);

  // The person's own scrolling decides whether we keep following.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const onScroll = () => {
      following.current = isNearBottom(panel);
    };
    panel.addEventListener("scroll", onScroll, { passive: true });
    return () => panel.removeEventListener("scroll", onScroll);
  }, [panelRef]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const added = messages.length > lastCount.current;
    lastCount.current = messages.length;
    if (chatKey !== lastChatKey.current) {
      lastChatKey.current = chatKey;
      following.current = true;
      panel.scrollTop = 0; // another chat: start from the top, then move to its newest answer below
    }
    if (added && messages.at(-1)?.role === "user") {
      // A new question: show it (and the "working" line under it).
      following.current = true;
      panel.scrollTop = panel.scrollHeight;
      return;
    }
    if (!following.current) return;
    const target = followTarget(panel, latestAnswerTop(panel));
    if (target !== null) panel.scrollTop = target;
  }, [panelRef, messages, status, chatKey]);
}
