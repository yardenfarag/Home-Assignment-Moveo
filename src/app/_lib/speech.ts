/**
 * @module app/_lib/speech
 *
 * Voice (Step 15, bonus, D127), using only the browser: speech recognition to ask by
 * voice (Chrome, Edge, Safari) and speech synthesis to read answers aloud (all modern
 * browsers). No server, no cost, nothing recorded by us. Each feature is hidden where
 * the browser can't do it.
 *
 * Also a tiny "what is being read aloud right now" store, so every speaker button
 * shows the right state (useSyncExternalStore).
 */

/** The parts of the Web Speech recognition API we use (not in every TS DOM lib). */
interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

/** A speech recognizer. */
export interface Recognizer {
  start: () => void;
  stop: () => void;
}

/** Events the recognizer reports. */
export interface RecognizerHandlers {
  /** The words heard so far in this session (interim and final). */
  onText: (text: string) => void;
  onEnd: () => void;
  /** A friendly message for the person (e.g. microphone blocked), and the browser's error code. */
  onError: (message: string, code: string) => void;
}

type RecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
};

/** The browser's recognizer class, if any. */
function recognitionClass(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** @returns true when this browser can turn speech into text. */
export const canListen = (): boolean => recognitionClass() !== null;

/** @returns true when this browser can read text aloud. */
export const canSpeak = (): boolean => typeof window !== "undefined" && "speechSynthesis" in window;

/** Friendly messages for recognition errors (the rest are silent: the person just tries again). */
const RECOGNITION_ERRORS: Record<string, string> = {
  "not-allowed": "Microphone access is blocked. Allow it in your browser to ask by voice.",
  "service-not-allowed": "Microphone access is blocked. Allow it in your browser to ask by voice.",
  "no-speech": "I didn't catch anything. Try again, a little closer to the mic.",
  "audio-capture": "No microphone was found.",
  network: "Speech recognition needs an internet connection.",
};

/**
 * Creates a one-shot recognizer (US English, live interim text).
 * @param handlers - text, end and error callbacks.
 * @returns the recognizer, or null when the browser can't listen.
 */
export function createRecognizer(handlers: RecognizerHandlers): Recognizer | null {
  const Recognition = recognitionClass();
  if (!Recognition) return null;
  const recognition = new Recognition();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.onresult = (event) => {
    let text = "";
    for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
    handlers.onText(text.trim());
  };
  recognition.onerror = (event) => {
    const message = RECOGNITION_ERRORS[event.error];
    if (message) handlers.onError(message, event.error);
  };
  recognition.onend = () => handlers.onEnd();
  return { start: () => recognition.start(), stop: () => recognition.stop() };
}

/**
 * Turns an answer's Markdown into text that sounds natural when read aloud.
 * @param markdown - the answer text.
 * @returns plain, speakable text.
 */
export function speakableText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links → their text
    .replace(/[*_`#>]+/g, "") // emphasis, code, headings, quotes
    .replace(/^\s*[-•]\s+/gm, "") // list bullets
    .replace(/≥\s*/g, "at least ")
    .replace(/≤\s*/g, "at most ")
    .replace(/(\d)\s*–\s*(\d)/g, "$1 to $2") // ranges use an en dash: 0–100 → 0 to 100 (dates like 2021-01-01 stay intact)
    .replace(/\s*→\s*/g, " to ")
    .replace(/\s*·\s*/g, ", ")
    .replace(/\s*\n+\s*/g, ". ")
    .replace(/\.\s*\./g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// --- What is being read aloud right now (one thing at a time) ---------------------------

let speakingKey: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** @returns the key of the answer being read aloud, or null. */
export const speakingSnapshot = (): string | null => speakingKey;

/**
 * Subscribes to speaking changes (for useSyncExternalStore).
 * @param listener - called on every change.
 * @returns the unsubscribe function.
 */
export function subscribeSpeaking(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Stops reading aloud. */
export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
  speakingKey = null;
  emit();
}

/**
 * Reads an answer aloud (stopping anything already playing).
 * @param key - identifies the answer (its message id), for the buttons' state.
 * @param markdown - the answer text.
 */
export function speak(key: string, markdown: string): void {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(speakableText(markdown));
  utterance.lang = "en-US";
  const done = () => {
    if (speakingKey === key) {
      speakingKey = null;
      emit();
    }
  };
  utterance.onend = done;
  utterance.onerror = done;
  speakingKey = key;
  emit();
  window.speechSynthesis.speak(utterance);
}
