"use client";
/**
 * 🔊 Listen / ■ Stop on an answer (Step 15, D127): reads the answer text aloud with the
 * browser's speech synthesis. Hidden where the browser can't speak. One answer at a time.
 */
import { useSyncExternalStore } from "react";
import { canSpeak, speak, speakingSnapshot, stopSpeaking, subscribeSpeaking } from "../../_lib/speech";

/** Support never changes during a visit, so there's nothing to subscribe to. */
const noSubscribe = () => () => {};

/** Props for {@link SpeakButton}. */
interface SpeakButtonProps {
  /** Identifies the answer (its message id). */
  speechKey: string;
  text: string;
}

/** Renders the button (or nothing without speech support). */
export function SpeakButton({ speechKey, text }: SpeakButtonProps) {
  const supported = useSyncExternalStore(noSubscribe, canSpeak, () => false);
  const speaking = useSyncExternalStore(subscribeSpeaking, speakingSnapshot, () => null) === speechKey;
  if (!supported) return null;
  return (
    <button
      type="button"
      onClick={() => (speaking ? stopSpeaking() : speak(speechKey, text))}
      aria-pressed={speaking}
      aria-label={speaking ? "Stop reading the answer aloud" : "Read the answer aloud"}
      className="ml-auto rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-xs text-slate-300 transition hover:border-sky-300/40 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
    >
      <span aria-hidden="true">{speaking ? "■" : "🔊"}</span> {speaking ? "Stop" : "Listen"}
    </button>
  );
}
