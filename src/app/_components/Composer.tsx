"use client";
/**
 * The message box (U7): Enter sends, Shift+Enter adds a line, Stop while answering.
 * Microphone button (Step 15, D127): speak the question; the words fill the box so a misheard hub name
 * can be fixed before pressing Ask. Hidden in browsers that can't listen.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent } from "react";
import { AGENT_LIMITS } from "@/core/agent/config";
import { canListen, createRecognizer, type Recognizer } from "../_lib/speech";

/** Longest message the API accepts — the agent's own limit (single source of truth). */
const MAX_CHARS = AGENT_LIMITS.maxUserMessageChars;

/** How long a voice hint (e.g. "microphone blocked") stays visible. */
const HINT_MS = 6_000;

/** Support never changes during a visit, so there's nothing to subscribe to. */
const noSubscribe = () => () => {};

/** A microphone, drawn in the button's text color (the emoji rendered unclearly in some fonts). */
function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
      <path d="M12 18v4M8 22h8" />
    </svg>
  );
}

/** A small filled square: "stop listening". */
function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

/** Props for {@link Composer}. */
interface ComposerProps {
  busy: boolean;
  /** `byVoice` is true when the question came from the mic (its answer is then read aloud). */
  onSend: (text: string, byVoice: boolean) => void;
  onStop: () => void;
}

/** Renders the composer. */
export function Composer({ busy, onSend, onStop }: ComposerProps) {
  const [text, setText] = useState("");
  const [fromVoice, setFromVoice] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const recognizer = useRef<Recognizer | null>(null);
  const micSupported = useSyncExternalStore(noSubscribe, canListen, () => false);
  const tooLong = text.length > MAX_CHARS;

  useEffect(() => {
    if (!voiceHint) return;
    const timer = setTimeout(() => setVoiceHint(null), HINT_MS);
    return () => clearTimeout(timer);
  }, [voiceHint]);

  useEffect(() => () => recognizer.current?.stop(), []);

  const toggleMic = () => {
    if (listening) {
      recognizer.current?.stop();
      return;
    }
    const before = text.trim() ? `${text.trim()} ` : "";
    recognizer.current = createRecognizer({
      onText: (heard) => {
        setText(before + heard);
        if (heard) setFromVoice(true);
      },
      onEnd: () => setListening(false),
      onError: setVoiceHint,
    });
    if (!recognizer.current) return;
    setVoiceHint(null);
    setListening(true);
    recognizer.current.start();
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || busy || tooLong) return;
    recognizer.current?.stop();
    onSend(trimmed, fromVoice);
    setText("");
    setFromVoice(false);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div>
      {voiceHint && (
        <p role="status" className="mb-2 px-2 text-xs text-amber-300">
          {voiceHint}
        </p>
      )}
      <form onSubmit={submit} className="glass flex items-end gap-2 rounded-2xl bg-slate-950/85 p-2 shadow-lg shadow-black/40">
        <label htmlFor="question" className="sr-only">
          Your question
        </label>
        <textarea
          id="question"
          rows={1}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            if (!event.target.value.trim()) setFromVoice(false);
          }}
          onKeyDown={onKeyDown}
          placeholder={listening ? "Listening… ask your question" : "Ask about a hub, hazard or region…"}
          className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-3 py-2 text-[15px] text-slate-100 placeholder:text-slate-500 focus:outline-none"
          aria-describedby={tooLong ? "too-long" : undefined}
        />
        {tooLong && (
          <span id="too-long" className="self-center text-xs text-amber-300">
            {text.length}/{MAX_CHARS}
          </span>
        )}
        {micSupported && !busy && (
          <button
            type="button"
            onClick={toggleMic}
            aria-pressed={listening}
            aria-label={listening ? "Stop listening" : "Ask by voice"}
            title={listening ? "Stop listening" : "Ask by voice"}
            className={`rounded-xl px-3 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 ${
              listening ? "animate-pulse bg-rose-500/80 text-white motion-reduce:animate-none" : "border border-white/15 text-slate-300 hover:bg-white/10"
            }`}
          >
            {listening ? <StopIcon /> : <MicIcon />}
          </button>
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
    </div>
  );
}
