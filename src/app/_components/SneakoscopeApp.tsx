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
import type { WidgetsData } from "@/core/widgets/widgetsData";
import { EMPTY_IDS, rememberSession, sessionIdsSnapshot, subscribeToStorage } from "../_lib/storage";
import { AssistantMessage } from "./answer/AssistantMessage";
import { ErrorCard } from "./answer/ErrorCard";
import { Composer } from "./Composer";
import { EmptyState } from "./EmptyState";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { Pane } from "./Pane";
import { SideNav } from "./SideNav";
import { TabBar, type ShellTab } from "./TabBar";
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
  const sessionIds = useSyncExternalStore(subscribeToStorage, sessionIdsSnapshot, () => EMPTY_IDS);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [freshness, setFreshness] = useState<string | null>(null);
  const [hubCount, setHubCount] = useState<number | null>(null);
  const [tab, setTab] = useState<ShellTab>("chat");
  const [loadingChat, setLoadingChat] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // sessionId travels with each sendMessage call (see ask); the transport only adds the message text. US units only (D126).
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

  // Keep the newest message in view inside the conversation panel (the page itself never scrolls).
  useEffect(() => {
    const body = scrollRef.current;
    body?.scrollTo({ top: body.scrollHeight, behavior: "smooth" });
  }, [messages.length, status]);

  const ask = useCallback(
    (question: string) => {
      if (busy) return;
      clearError();
      void sendMessage({ text: question }, { body: { sessionId } });
    },
    [busy, clearError, sendMessage, sessionId],
  );

  const retryLast = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const question = textOf(lastUser);
    if (!question) return;
    setMessages(messages.slice(0, messages.lastIndexOf(lastUser!)));
    clearError();
    void sendMessage({ text: question }, { body: { sessionId } });
  }, [messages, setMessages, clearError, sendMessage, sessionId]);

  const newChat = useCallback(() => {
    void stop();
    clearError();
    setMessages([]);
    setSessionId(null);
    setTab("chat");
  }, [stop, clearError, setMessages]);

  const openChat = useCallback(
    async (id: string) => {
      setTab("chat");
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


  /** Asking from the overview (or an alert) switches small screens to the conversation. */
  const askFromElsewhere = useCallback(
    (question: string) => {
      setTab("chat");
      ask(question);
    },
    [ask],
  );

  const onStatus = useCallback((status: WidgetsData["dataStatus"]) => {
    setFreshness(`${status.hubCount} hubs · weather through ${status.weatherThrough}`);
    setHubCount(status.hubCount);
  }, []);

  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;
  const completedAnswers = messages.filter((m) => m.parts.some((part) => part.type === "data-answer")).length;

  // Small screens show one panel at a time (bottom tabs); desktop (xl, 1280 px+) shows all three (D125).
  const show = (panel: ShellTab) => (tab === panel ? "flex" : "hidden xl:flex");

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Header freshness={freshness} />

      <div className="mx-auto grid min-h-0 w-full max-w-[1680px] flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-3 p-3 xl:grid-cols-[16rem_minmax(0,1fr)_22rem]">
        <Pane title="Your chats" className={show("chats")}>
          <SideNav sessionIds={sessionIds} activeId={sessionId} onOpen={(id) => void openChat(id)} onNew={newChat} refreshKey={completedAnswers} />
        </Pane>

        <Pane
          title="Conversation"
          className={show("chat")}
          bodyRef={scrollRef}
          busy={loadingChat}
          footer={<Composer busy={busy} onSend={ask} onStop={() => void stop()} />}
        >
          <div className="space-y-4">
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
          </div>
        </Pane>

        <Pane title="Overview" className={show("overview")}>
          <WidgetsRail onAsk={askFromElsewhere} onStatus={onStatus} />
          <Footer className="mt-3 px-1 xl:hidden" />
        </Pane>
      </div>
      <Footer className="hidden shrink-0 xl:block" />
      <TabBar tab={tab} onChange={setTab} className="xl:hidden" />
    </div>
  );
}
