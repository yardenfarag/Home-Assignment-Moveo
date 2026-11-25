/**
 * One assistant turn: live progress + streaming text while working, then the
 * validated answer card — or ONE friendly error card (U2, B5). A draft that never
 * reached the number checks (stopped, cut off) is dimmed and labelled as such (S1).
 */
import type { SneakoscopeDataParts, SneakoscopeUIMessage } from "@/core/api/chatStream";
import { STREAM_INTERRUPTED } from "@/core/errors/userErrors";
import { ANSWER_STALLED, type ChatError } from "../../_lib/clientErrors";
import { READING_QUESTION, STOPPED_DRAFT, STOPPED_EMPTY, UNCHECKED_DRAFT } from "../../_lib/copy";
import { FOCUS_RING } from "../../_lib/styles";
import { ErrorCard } from "./ErrorCard";
import { FinalAnswerCard } from "./FinalAnswerCard";
import { Markdown } from "./Markdown";
import { ProgressList } from "./ProgressList";

/** Why an answer ended without a validated answer, when the shell knows. */
export type AnswerEnding = "stopped" | "stalled";

/** Props for {@link AssistantMessage}. */
interface AssistantMessageProps {
  message: SneakoscopeUIMessage;
  /** True while this is the message being streamed (only ever the very last message). */
  isStreaming: boolean;
  /** Set when the person pressed Stop, or the watchdog gave up waiting. */
  ending: AnswerEnding | null;
  /** The request's failure, when it failed while streaming this message. */
  interruption: ChatError | null;
  /** True while another answer is on its way (follow-up chips wait). */
  busy: boolean;
  onAsk: (question: string) => void;
  /** Only the newest answer can be retried (retrying an older one would rewrite the chat). */
  onRetry?: () => void;
}

/** What the message's parts say so far. */
interface ParsedTurn {
  progress: SneakoscopeDataParts["progress"][];
  text: string;
  retryMessage: string | null;
  answer: SneakoscopeDataParts["answer"] | null;
  error: SneakoscopeDataParts["error"] | null;
}

/**
 * Reads a message's parts: progress lines, the newest answer text, and how it ended.
 * @param message - the assistant message.
 * @returns the parsed turn.
 */
function parseTurn(message: SneakoscopeUIMessage): ParsedTurn {
  const turn: ParsedTurn = { progress: [], text: "", retryMessage: null, answer: null, error: null };
  for (const part of message.parts) {
    if (part.type === "data-progress") turn.progress.push(part.data);
    else if (part.type === "data-retry") {
      turn.retryMessage = part.data.message;
      turn.text = "";
    } else if (part.type === "text") turn.text = part.text; // the newest text part wins (the model may restart its answer)
    else if (part.type === "data-answer") turn.answer = part.data;
    else if (part.type === "data-error") turn.error = part.data;
  }
  return turn;
}

/** Renders an assistant turn. */
export function AssistantMessage({ message, isStreaming, ending, interruption, busy, onAsk, onRetry }: AssistantMessageProps) {
  const { progress, text, retryMessage, answer, error } = parseTurn(message);

  if (answer) {
    return (
      <article className="glass rounded-2xl p-5" aria-label="Sneakoscope's answer">
        <FinalAnswerCard answer={answer} speechKey={message.id} onAsk={onAsk} busy={busy} />
      </article>
    );
  }

  if (error) {
    return (
      <article className="glass rounded-2xl p-5" aria-label="Sneakoscope's answer">
        <div className="space-y-3">
          <ProgressList items={progress} active={false} />
          <ErrorCard error={error} onRetry={onRetry} />
        </div>
      </article>
    );
  }

  if (isStreaming) {
    return (
      <article className="glass rounded-2xl p-5" aria-label="Sneakoscope's answer" aria-busy="true">
        <div className="space-y-3">
          <ProgressList items={progress} active />
          {retryMessage && <p className="text-xs text-amber-200/90">{retryMessage}</p>}
          {text ? (
            <div className="relative">
              <Markdown text={text} />
              <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-sky-300/70 align-middle motion-reduce:animate-none" aria-hidden="true" />
            </div>
          ) : (
            progress.length === 0 && !retryMessage && <p className="text-sm text-slate-400">{READING_QUESTION}</p>
          )}
        </div>
      </article>
    );
  }

  // Ended without a validated answer: keep the draft visible, but never let it pass for a checked answer.
  const stopped = ending === "stopped";
  return (
    <article className="glass rounded-2xl p-5" aria-label="Sneakoscope's unfinished answer">
      <div className="space-y-3">
        <ProgressList items={progress} active={false} />
        {text && (
          <div className="opacity-60">
            <Markdown text={text} />
          </div>
        )}
        {stopped ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs text-slate-400">{text ? STOPPED_DRAFT : STOPPED_EMPTY}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className={`rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-slate-200 transition hover:bg-white/10 ${FOCUS_RING}`}
              >
                Ask again
              </button>
            )}
          </div>
        ) : (
          <>
            {text && <p className="text-xs text-slate-400">{UNCHECKED_DRAFT}</p>}
            <ErrorCard error={ending === "stalled" ? ANSWER_STALLED : (interruption ?? STREAM_INTERRUPTED)} onRetry={onRetry} />
          </>
        )}
      </div>
    </article>
  );
}
