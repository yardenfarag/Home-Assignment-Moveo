"use client";
/**
 * The message box (U7): Enter sends, Shift+Enter adds a line, Stop while answering.
 */
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { AGENT_LIMITS } from "@/core/agent/config";

/** Longest message the API accepts — the agent's own limit (single source of truth). */
const MAX_CHARS = AGENT_LIMITS.maxUserMessageChars;

/** Props for {@link Composer}. */
interface ComposerProps {
  busy: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

/** Renders the composer. */
export function Composer({ busy, onSend, onStop }: ComposerProps) {
  const [text, setText] = useState("");
  const tooLong = text.length > MAX_CHARS;

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || busy || tooLong) return;
    onSend(trimmed);
    setText("");
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form onSubmit={submit} className="glass flex items-end gap-2 rounded-2xl bg-slate-950/85 p-2 shadow-lg shadow-black/40">
      <label htmlFor="question" className="sr-only">
        Your question
      </label>
      <textarea
        id="question"
        rows={1}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask about a hub, hazard or region…"
        className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-3 py-2 text-[15px] text-slate-100 placeholder:text-slate-500 focus:outline-none"
        aria-describedby={tooLong ? "too-long" : undefined}
      />
      {tooLong && (
        <span id="too-long" className="self-center text-xs text-amber-300">
          {text.length}/{MAX_CHARS}
        </span>
      )}
      {busy ? (
        <button
          type="button"
          onClick={onStop}
          className="rounded-xl border border-white/15 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
        >
          Stop
        </button>
      ) : (
        <button
          type="submit"
          disabled={!text.trim() || tooLong}
          className="rounded-xl bg-sky-400/90 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
        >
          Ask
        </button>
      )}
    </form>
  );
}
