"use client";
/**
 * Chat history (U5b): THIS browser's past chats, newest first. Opening one
 * restores its questions and validated answers; "New chat" starts fresh.
 * Loading, failed and empty each have their own line (S4).
 */
import { useEffect, useState } from "react";
import type { SessionSummary } from "@/core/db/chatTranscript";
import { SESSIONS_FAILED } from "../_lib/clientErrors";
import { BUSY_HINT } from "../_lib/copy";
import { fetchJson } from "../_lib/fetchJson";
import { relativeTime } from "../_lib/labels";
import { FOCUS_RING, WAITING } from "../_lib/styles";

/** Props for {@link SideNav}. */
interface SideNavProps {
  sessionIds: string[];
  activeId: string | null;
  /** The chat being opened right now, or null. */
  openingId: string | null;
  /** True while an answer is on its way (opening another chat waits). */
  busy: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
  /** Changes whenever an answer completes, so titles/dates are re-read (a chat gets its title once its first answer is saved). */
  refreshKey: number;
}

/** The last result of loading the list: the sessions, or a failure. */
type Loaded = { sessions: SessionSummary[]; failed: false } | { sessions: null; failed: true };

/** Renders the chat list. */
export function SideNav({ sessionIds, activeId, openingId, busy, onOpen, onNew, refreshKey }: SideNavProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);
  const hasIds = sessionIds.length > 0;

  useEffect(() => {
    if (sessionIds.length === 0) return;
    const controller = new AbortController();
    const ids = sessionIds.map(encodeURIComponent).join(",");
    fetchJson<{ sessions: SessionSummary[] }>(`/api/chat/sessions?ids=${ids}`, { signal: controller.signal })
      .then((json) => setLoaded({ sessions: Array.isArray(json.sessions) ? json.sessions : [], failed: false }))
      .catch(() => {
        if (controller.signal.aborted) return;
        // A failed refresh keeps the list we already have; only a first load shows the failure.
        setLoaded((current) => (current && !current.failed ? current : { sessions: null, failed: true }));
      });
    return () => controller.abort();
  }, [sessionIds, refreshKey, attempt]);

  // No remembered ids: nothing to show, whatever was loaded before (S4).
  const sessions = hasIds && loaded && !loaded.failed ? loaded.sessions : [];
  const state = !hasIds ? "empty" : !loaded ? "loading" : loaded.failed ? "failed" : sessions.length === 0 ? "empty" : "list";

  return (
    <nav className="flex h-full flex-col gap-3" aria-label="Your chats">
      <button
        type="button"
        onClick={onNew}
        className={`rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 transition hover:bg-white/10 ${FOCUS_RING}`}
      >
        + New chat
      </button>
      {state === "loading" && (
        <p className="px-1 text-xs text-slate-500" role="status">
          Loading your chats…
        </p>
      )}
      {state === "failed" && (
        <div className="space-y-1.5 px-1 text-xs text-slate-400" role="status">
          <p>{SESSIONS_FAILED}</p>
          <button type="button" onClick={() => {
              setLoaded(null); // show "Loading…" again while retrying
              setAttempt((n) => n + 1);
            }} className={`rounded text-sky-300 underline underline-offset-2 ${FOCUS_RING}`}>
            Try again
          </button>
        </div>
      )}
      {state === "empty" && (
        <p className="px-1 text-xs leading-relaxed text-slate-500">Your conversations will appear here. They&apos;re saved for this browser only.</p>
      )}
      {state === "list" && (
        <ul className="-mx-1 space-y-0.5">
          {sessions.map((session) => {
            const waiting = busy && session.id !== activeId;
            return (
              <li key={session.id}>
                <button
                  type="button"
                  onClick={() => !waiting && onOpen(session.id)}
                  aria-current={session.id === activeId ? "true" : undefined}
                  aria-disabled={waiting || undefined}
                  aria-busy={session.id === openingId || undefined}
                  title={waiting ? BUSY_HINT : undefined}
                  className={`w-full rounded-lg px-2 py-1.5 text-left transition hover:bg-white/5 ${FOCUS_RING} ${WAITING} ${
                    session.id === activeId || session.id === openingId ? "bg-white/[0.07]" : ""
                  }`}
                >
                  <span className="block truncate text-sm text-slate-200">{session.title ?? "Untitled chat"}</span>
                  <span className="text-[11px] text-slate-500">
                    {session.id === openingId ? "Opening…" : session.lastMessageAt ? relativeTime(session.lastMessageAt) : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
