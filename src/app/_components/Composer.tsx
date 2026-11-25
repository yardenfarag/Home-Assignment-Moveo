"use client";
/**
 * The message box (U7): Enter sends, Shift+Enter adds a line, Stop while answering. The box
 * grows with its text (up to a limit, then scrolls).
 *
 * Two ways to ask (D129): type, or conversation mode (the sound-waves button, hidden in browsers
 * that can't listen). Conversation mode is hands-free: listen → when you pause, send automatically
 * → the answer is read aloud → listen again. The mic stays off while the answer is being read, so
 * it never hears itself. Ends on a click, or when it hears nothing. Words heard are added after
 * anything already typed, never in place of it (S10).
 */
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import { AGENT_LIMITS } from "@/core/agent/config";
import { createRecognizer, stopSpeaking, useCanListen, useSpeakingKey, type Recognizer } from "../_lib/speech";
import { FOCUS_RING } from "../_lib/styles";

/** Longest message the API accepts — the agent's own limit (single source of truth). */
const MAX_CHARS = AGENT_LIMITS.maxUserMessageChars;

/** How long a voice hint (e.g. "microphone blocked") stays visible. */
const HINT_MS = 6_000;

/** Pause between the end of a read-aloud answer and listening again (conversation mode). */
const RELISTEN_DELAY_MS = 700;

/** Shown when the browser refuses to start the microphone (e.g. it's still busy from the last session). */
const MIC_START_FAILED = "I couldn't start the microphone. Please try again in a moment.";

/**
 * Typed text plus words heard, with one space between.
 * @param typed - what was in the box when listening started.
 * @param heard - the words heard so far.
 * @returns the combined text.
 */
const joinText = (typed: string, heard: string) => [typed, heard].filter(Boolean).join(" ");

/** Sound waves: conversation mode. */
function WavesIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4" />
    </svg>
  );
}

/** Props for {@link Composer}. */
interface ComposerProps {
  busy: boolean;
  /** Why sending is paused right now (e.g. a saved chat is opening), or null. */
  locked: string | null;
  /** `byVoice` is true in conversation mode (the answer is then read aloud). */
  onSend: (text: string, byVoice: boolean) => void;
  onStop: () => void;
  /** The text box, so the shell can move focus to it. */
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}

/** Renders the composer. */
export function Composer({ busy, locked, onSend, onStop, inputRef }: ComposerProps) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [conversation, setConversation] = useState(false);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const recognizer = useRef<Recognizer | null>(null);
  const micSupported = useCanListen();
  const speaking = useSpeakingKey() !== null;
  const tooLong = text.length > MAX_CHARS;

  // Callbacks from the recognizer run later, so they read the latest values through refs.
  const conversationRef = useRef(false);
  const onSendRef = useRef(onSend);
  const textRef = useRef(text);
  /** What was typed before listening started (kept; heard words go after it). */
  const typedBefore = useRef("");
  const heard = useRef("");
  const hadError = useRef(false);
  useEffect(() => {
    onSendRef.current = onSend;
  }, [onSend]);
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  useEffect(() => {
    if (!voiceHint) return;
    const timer = setTimeout(() => setVoiceHint(null), HINT_MS);
    return () => clearTimeout(timer);
  }, [voiceHint]);

  useEffect(() => () => recognizer.current?.stop(), []);

  /** Leaves conversation mode (and stops listening and speaking). */
  const endConversation = useCallback((hint?: string) => {
    conversationRef.current = false;
    setConversation(false);
    recognizer.current?.stop();
    stopSpeaking();
    if (hint) setVoiceHint(hint);
  }, []);

  /** Starts one listening session: the question is sent when the person stops talking. */
  const startListening = useCallback(() => {
    heard.current = "";
    hadError.current = false;
    typedBefore.current = textRef.current.trim();
    const next = createRecognizer({
      onText: (words) => {
        heard.current = words;
        setText(joinText(typedBefore.current, words));
      },
      onEnd: () => {
        setListening(false);
        if (!conversationRef.current) return;
        const words = heard.current.trim();
        if (words) {
          onSendRef.current(joinText(typedBefore.current, words), true);
          setText("");
        } else {
          // Nothing heard: leave conversation mode (a blocked mic already showed its own hint).
          endConversation(hadError.current ? undefined : "Conversation mode ended: I didn't hear anything.");
        }
      },
      onError: (message, code) => {
        // "Nothing heard" ends conversation mode with its own message; real problems keep their hint.
        if (code === "no-speech" && conversationRef.current) return;
        hadError.current = true;
        setVoiceHint(message);
      },
    });
    if (!next) return;
    recognizer.current = next;
    try {
      next.start(); // can throw synchronously (e.g. InvalidStateError while a session is still closing)
    } catch {
      recognizer.current = null;
      setListening(false);
      endConversation(MIC_START_FAILED);
      return;
    }
    setVoiceHint(null);
    setListening(true);
  }, [endConversation]);

  // Conversation loop: whenever nothing is being sent or read aloud, listen for the next question.
  useEffect(() => {
    if (!conversation || busy || locked || speaking || listening) return;
    const timer = setTimeout(startListening, RELISTEN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [conversation, busy, locked, speaking, listening, startListening]);

  /** Turns conversation mode on or off (on: the loop above starts listening). */
  const toggleConversation = () => {
    if (conversation) {
      endConversation();
      return;
    }
    recognizer.current?.stop();
    stopSpeaking();
    conversationRef.current = true;
    setConversation(true);
  };

  /**
   * Sends the typed question (unless it's empty, too long, or sending is paused).
   * @param event - the form submit, when it came from the form.
   */
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || busy || locked || tooLong) return;
    recognizer.current?.stop();
    onSend(trimmed, false);
    setText("");
  };

  /**
   * Enter sends; Shift+Enter (or Enter while an IME is composing) adds a line.
   * @param event - the key event.
   */
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const conversationStatus = listening
    ? "Listening… just talk, I'll send it when you pause."
    : busy
      ? "Getting the answer…"
      : speaking
        ? "Reading the answer. I'll listen again when it's done."
        : "Getting ready to listen…";

  return (
    <div>
      {conversation && (
        <p role="status" className="mb-2 flex items-center gap-2 px-2 text-xs text-sky-200">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-300 motion-reduce:animate-none" aria-hidden="true" />
          Conversation mode · {conversationStatus}
        </p>
      )}
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
          ref={inputRef}
          rows={1}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={listening ? "Listening… ask your question" : "Ask about a hub, hazard or region…"}
          className="field-sizing-content max-h-40 min-h-10 flex-1 resize-none overflow-y-auto bg-transparent px-3 py-2 text-[15px] text-slate-100 placeholder:text-slate-500 focus:outline-none"
          aria-describedby={tooLong ? "too-long" : undefined}
        />
        {tooLong && (
          <span id="too-long" className="self-center text-xs text-amber-300">
            {text.length}/{MAX_CHARS}
          </span>
        )}
        {micSupported && (
          <button
            type="button"
            onClick={toggleConversation}
            aria-pressed={conversation}
            aria-label={conversation ? "End conversation mode" : "Start conversation mode (hands-free)"}
            title={conversation ? "End conversation mode" : "Conversation mode: talk hands-free, answers are read aloud"}
            className={`rounded-xl px-3 py-2 text-sm transition ${FOCUS_RING} ${
              conversation ? "bg-sky-400/90 text-slate-950 hover:bg-sky-300" : "border border-white/15 text-slate-300 hover:bg-white/10"
            }`}
          >
            <WavesIcon />
          </button>
        )}
        {busy ? (
          <button type="button" onClick={onStop} className={`rounded-xl border border-white/15 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10 ${FOCUS_RING}`}>
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!text.trim() || tooLong || Boolean(locked)}
            title={locked ?? undefined}
            className="rounded-xl bg-sky-400/90 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
          >
            Ask
          </button>
        )}
      </form>
    </div>
  );
}
