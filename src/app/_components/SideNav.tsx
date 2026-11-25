"use client";
/**
 * Chat history (U5b): THIS browser's past chats, newest first. Opening one
 * restores its questions and validated answers; "New chat" starts fresh.
 */
import { useEffect, useState } from "react";
import type { SessionSummary } from "@/core/db/chatTranscript";
import { relativeTime } from "../_lib/labels";

/** Props for {@link SideNav}. */
interface SideNavProps {
  sessionIds: string[];
  activeId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  /** Changes whenever an answer completes, so titles/dates are re-read (a chat gets its title once its first answer is saved). */
  refreshKey: number;
}

/** Renders the chat list. */
export function SideNav({ sessionIds, activeId, onOpen, onNew, refreshKey }: SideNavProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  useEffect(() => {
    if (sessionIds.length === 0) return;
    let alive = true;
    fetch(`/api/chat/sessions?ids=${sessionIds.join(",")}`)
      .then((res) => (res.ok ? res.json() : { sessions: [] }))
      .then((json: { sessions: SessionSummary[] }) => alive && setSessions(json.sessions))
      .catch(() => alive && setSessions([]));
    return () => {
      alive = false;
    };
  }, [sessionIds, refreshKey]);

  return (
    <nav className="flex h-full flex-col gap-3" aria-label="Your chats">
      <button
        type="button"
        onClick={onNew}
        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
      >
        + New chat
      </button>
      <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-slate-500">Your chats</h2>
      {sessions.length === 0 ? (
        <p className="px-1 text-xs leading-relaxed text-slate-500">Your conversations will appear here. They&apos;re saved for this browser only.</p>
      ) : (
        <ul className="-mx-1 space-y-0.5 overflow-y-auto">
          {sessions.map((session) => (
            <li key={session.id}>
              <button
                type="button"
                onClick={() => onOpen(session.id)}
                aria-current={session.id === activeId ? "true" : undefined}
                className={`w-full rounded-lg px-2 py-1.5 text-left transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 ${
                  session.id === activeId ? "bg-white/[0.07]" : ""
                }`}
              >
                <span className="block truncate text-sm text-slate-200">{session.title ?? "Untitled chat"}</span>
                {session.lastMessageAt && <span className="text-[11px] text-slate-500">{relativeTime(session.lastMessageAt)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
