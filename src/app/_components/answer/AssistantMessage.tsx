/**
 * One assistant turn: live progress + streaming text while working, then the
 * validated answer card — or a friendly error card (U2).
 */
import type { SneakoscopeDataParts, SneakoscopeUIMessage } from "@/core/api/chatStream";
import { STREAM_INTERRUPTED } from "@/core/errors/userErrors";
import { ErrorCard } from "./ErrorCard";
import { FinalAnswerCard } from "./FinalAnswerCard";
import { Markdown } from "./Markdown";
import { ProgressList } from "./ProgressList";

/** Props for {@link AssistantMessage}. */
interface AssistantMessageProps {
  message: SneakoscopeUIMessage;
  /** True while this is the message being streamed. */
  isStreaming: boolean;
  onAsk: (question: string) => void;
  onRetry: () => void;
}

/** Renders an assistant turn. */
export function AssistantMessage({ message, isStreaming, onAsk, onRetry }: AssistantMessageProps) {
  const progress: SneakoscopeDataParts["progress"][] = [];
  let text = "";
  let retrying = false;
  let answer: SneakoscopeDataParts["answer"] | null = null;
  let error: SneakoscopeDataParts["error"] | null = null;

  for (const part of message.parts) {
    if (part.type === "data-progress") progress.push(part.data);
    else if (part.type === "data-retry") {
      retrying = true;
      text = "";
    } else if (part.type === "text") text = part.text;
    else if (part.type === "data-answer") answer = part.data;
    else if (part.type === "data-error") error = part.data;
  }

  return (
    <article className="glass rounded-2xl p-5" aria-label="Sneakoscope's answer">
      {answer ? (
        <FinalAnswerCard answer={answer} speechKey={message.id} onAsk={onAsk} />
      ) : error ? (
        <div className="space-y-3">
          <ProgressList items={progress} />
          <ErrorCard error={error} onRetry={onRetry} />
        </div>
      ) : (
        <div className="space-y-3" aria-live="polite" aria-busy={isStreaming}>
          <ProgressList items={progress} />
          {retrying && <p className="text-xs text-amber-200/90">Double-checking my numbers against the data…</p>}
          {text ? (
            <div className="relative">
              <Markdown text={text} />
              {isStreaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-sky-300/70 align-middle motion-reduce:animate-none" aria-hidden="true" />}
            </div>
          ) : (
            progress.length === 0 && isStreaming && <p className="text-sm text-slate-400">Reading the question…</p>
          )}
          {!isStreaming && !text && (
            <ErrorCard error={STREAM_INTERRUPTED} onRetry={onRetry} />
          )}
        </div>
      )}
    </article>
  );
}
