"use client";
/**
 * @module app/_lib/useChatHistory
 *
 * Opening a saved chat (B2) without races: only the NEWEST request may land. Every new open,
 * "New chat" or question cancels the one in flight, each request has a timeout, and a failure
 * is reported (the shell shows a friendly line with Try again) instead of being swallowed.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SneakoscopeUIMessage } from "@/core/api/chatStream";
import type { TranscriptTurn } from "@/core/db/chatTranscript";
import { fetchJson } from "./fetchJson";
import { messagesFromTurns } from "./transcript";

/** A saved chat can be long; give it a little more time than a small JSON request. */
const HISTORY_TIMEOUT_MS = 20_000;

/** What {@link useChatHistory} returns. */
export interface ChatHistory {
  /** The chat being opened right now, or null. */
  loadingId: string | null;
  /** The chat that failed to open (for Try again), or null. */
  failedId: string | null;
  /** Starts opening a chat (cancels any open in flight). */
  open: (id: string) => void;
  /** Cancels an open in flight and clears a failure (New chat, a new question). */
  cancel: () => void;
}

/**
 * Loads saved chats on request; only the latest request's result is applied.
 * @param onLoaded - receives the chat id and its rebuilt messages.
 * @returns loading state and the open/cancel actions.
 */
export function useChatHistory(onLoaded: (id: string, messages: SneakoscopeUIMessage[]) => void): ChatHistory {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  }, [onLoaded]);

  // Leaving the page cancels whatever is still loading.
  useEffect(() => () => controller.current?.abort(), []);

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setLoadingId(null);
    setFailedId(null);
  }, []);

  const open = useCallback((id: string) => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setLoadingId(id);
    setFailedId(null);
    void (async () => {
      try {
        const { turns } = await fetchJson<{ turns: TranscriptTurn[] }>(`/api/chat/history?sessionId=${encodeURIComponent(id)}`, {
          signal: current.signal,
          timeoutMs: HISTORY_TIMEOUT_MS,
        });
        if (controller.current !== current) return; // a newer action replaced this one
        if (!Array.isArray(turns)) throw new Error("No turns in the response.");
        onLoadedRef.current(id, messagesFromTurns(turns));
      } catch {
        if (controller.current === current) setFailedId(id);
      } finally {
        if (controller.current === current) {
          controller.current = null;
          setLoadingId(null);
        }
      }
    })();
  }, []);

  return useMemo(() => ({ loadingId, failedId, open, cancel }), [loadingId, failedId, open, cancel]);
}
