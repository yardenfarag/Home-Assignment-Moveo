"use client";
/**
 * The whole app (U1): side nav (this browser's chats) · chat · widgets.
 * Talks ONLY to our API (requirement 6): /api/chat (streaming), /api/widgets,
 * /api/chat/sessions and /api/chat/history.
 */
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { SneakoscopeDataParts, SneakoscopeUIMessage } from "@/core/api/chatStream";
import type { TranscriptTurn } from "@/core/db/chatTranscript";
import { userError } from "@/core/errors/userErrors";
import type { UnitSystem } from "@/core/utils/units";
import type { WidgetsData } from "@/core/widgets/widgetsData";
import { EMPTY_IDS, loadUnits, rememberSession, saveUnits, sessionIdsSnapshot, subscribeToStorage } from "../_lib/storage";
import { AssistantMessage } from "./answer/AssistantMessage";
import { ErrorCard } from "./answer/ErrorCard";
import { Composer } from "./Composer";
import { EmptyState } from "./EmptyState";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { SideNav } from "./SideNav";
import { WidgetsRail } from "./WidgetsRail";

/** Text of a user message. */
function textOf(message: SneakoscopeUIMessage | undefined): string {
  return message?.parts.map((part) => (part.type === "text" ? part.text : "")).join("") ?? "";
}

/** Friendly error from a failed request (the API answers with `{ error: {...} }`). */
function requestError(error: Error): SneakoscopeDataParts["error"] {
  try {
    const parsed = JSON.parse(error.message) as { error?: SneakoscopeDataParts["error"] };
    if (parsed.error?.message) return parsed.error;
  } catch {
    // not JSON — e.g. the network dropped
  }
  const { code, message, hint, retryable } = userError("internal_error");
  return { code, message, hint, retryable };
}

/** Rebuilds UI messages from a saved transcript (validated answers, as they were shown). */
function messagesFromTurns(turns: TranscriptTurn[]): SneakoscopeUIMessage[] {
  return turns.flatMap((turn, index) => [
    { id: `history-user-${index}`, role: "user" as const, parts: [{ type: "text" as const, text: turn.question }] },
    {
      id: `history-answer-${index}`,
      role: "assistant" as const,
      parts: [{ type: "data-answer" as const, id: "answer", data: turn.answer }],
    },
  ]);
}

/** The app. */
export function SneakoscopeApp() {
  // Browser-remembered values, read hydration-safely (the server always renders the defaults).
  const units = useSyncExternalStore<UnitSystem>(subscribeToStorage, loadUnits, () => "us");
  const sessionIds = useSyncExternalStore(subscribeToStorage, sessionIdsSnapshot, () => EMPTY_IDS);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [freshness, setFreshness] = useState<string | null>(null);
  const [hubCount, setHubCount] = useState<number | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // sessionId and units travel with each sendMessage call (see ask); the transport only adds the message text.
  const transport = useMemo(
    () =>
      new DefaultChatTransport<SneakoscopeUIMessage>({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages, body }) => ({ body: { ...body, message: textOf(messages.at(-1)) } }),
      }),
    [],
  );

  const { messages, sendMessage, setMessages, status, error, clearError, stop } = useChat<SneakoscopeUIMessage>({
    transport,
    onData: (part) => {
      if (part.type === "data-session") {
        setSessionId(part.data.sessionId);
        rememberSession(part.data.sessionId);
      }
    },
  });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, status]);

  const ask = useCallback(
    (question: string) => {
      if (busy) return;
      clearError();
      void sendMessage({ text: question }, { body: { sessionId, units } });
    },
    [busy, clearError, sendMessage, sessionId, units],
  );

  const retryLast = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const question = textOf(lastUser);
    if (!question) return;
    setMessages(messages.slice(0, messages.lastIndexOf(lastUser!)));
    clearError();
    void sendMessage({ text: question }, { body: { sessionId, units } });
  }, [messages, setMessages, clearError, sendMessage, sessionId, units]);

  const newChat = useCallback(() => {
    void stop();
    clearError();
    setMessages([]);
    setSessionId(null);
    setNavOpen(false);
  }, [stop, clearError, setMessages]);

  const openChat = useCallback(
    async (id: string) => {
      setNavOpen(false);
      if (id === sessionId || busy) return;
      setLoadingChat(true);
      try {
        const res = await fetch(`/api/chat/history?sessionId=${id}`);
        if (!res.ok) throw new Error(await res.text());
        const { turns } = (await res.json()) as { turns: TranscriptTurn[] };
        clearError();
        setMessages(messagesFromTurns(turns));
        setSessionId(id);
      } catch {
        // keep the current chat; the side nav stays usable
      } finally {
        setLoadingChat(false);
      }
    },
    [busy, clearError, setMessages, sessionId],
  );

  const changeUnits = useCallback((next: UnitSystem) => saveUnits(next), []);

  const onStatus = useCallback((status: WidgetsData["dataStatus"]) => {
    setFreshness(`${status.hubCount} hubs · weather through ${status.weatherThrough}`);
    setHubCount(status.hubCount);
  }, []);

  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;
  const completedAnswers = messages.filter((m) => m.parts.some((part) => part.type === "data-answer")).length;

  return (
    <div className="flex min-h-screen flex-col">
      <Header units={units} onUnitsChange={changeUnits} freshness={freshness} onToggleNav={() => setNavOpen((o) => !o)} />

      <div className="mx-auto grid w-full max-w-[1600px] flex-1 grid-cols-[minmax(0,1fr)] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_22rem]">
        <aside
          className={`${navOpen ? "fixed inset-0 z-20 block bg-slate-950/95 p-6" : "hidden"} lg:static lg:block lg:bg-transparent lg:p-0`}
        >
          {navOpen && (
            <button type="button" onClick={() => setNavOpen(false)} className="mb-4 text-sm text-slate-400 lg:hidden">
              ✕ Close
            </button>
          )}
          <SideNav sessionIds={sessionIds} activeId={sessionId} onOpen={(id) => void openChat(id)} onNew={newChat} refreshKey={completedAnswers} />
        </aside>

        <main className="flex min-w-0 flex-col gap-4">
          <div className="flex-1 space-y-4" aria-busy={loadingChat}>
            {loadingChat && <p className="text-sm text-slate-400">Opening your chat…</p>}
            {messages.length === 0 && !loadingChat && <EmptyState onAsk={ask} hubCount={hubCount} />}
            {messages.map((message) =>
              message.role === "user" ? (
                <div key={message.id} className="flex justify-end">
                  <p className="max-w-[80%] rounded-2xl rounded-br-md bg-sky-400/15 px-4 py-2.5 text-[15px] text-slate-100">{textOf(message)}</p>
                </div>
              ) : (
                <AssistantMessage
                  key={message.id}
                  message={message}
                  units={units}
                  isStreaming={busy && message.id === lastAssistantId}
                  onAsk={ask}
                  onRetry={retryLast}
                />
              ),
            )}
            {status === "submitted" && messages.at(-1)?.role === "user" && (
              <div className="glass rounded-2xl p-5 text-sm text-slate-400" aria-live="polite">
                Reading the question…
              </div>
            )}
            {error && <ErrorCard error={requestError(error)} onRetry={retryLast} />}
            <div ref={bottomRef} />
          </div>
          <div className="sticky bottom-4">
            <Composer busy={busy} onSend={ask} onStop={() => void stop()} />
          </div>
        </main>

        <aside className="order-first min-w-0 lg:col-span-2 xl:order-none xl:col-span-1" aria-label="Overview">
          <WidgetsRail onAsk={ask} onStatus={onStatus} />
        </aside>
      </div>
      <Footer />
    </div>
  );
}
