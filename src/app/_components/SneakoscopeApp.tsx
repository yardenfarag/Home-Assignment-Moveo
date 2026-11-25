"use client";
/**
 * The whole app (U1): side nav (this browser's chats) · chat · widgets.
 * Talks ONLY to our API (requirement 6): /api/chat (streaming), /api/widgets,
 * /api/chat/sessions and /api/chat/history.
 */
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { SneakoscopeUIMessage } from "@/core/api/chatStream";
import type { WidgetsData } from "@/core/widgets/widgetsData";
import { ANSWER_STALLED, CHAT_OPEN_FAILED, MESSAGE_FAILED, requestError } from "../_lib/clientErrors";
import { LIVE_STATUS, OPENING_CHAT, READING_QUESTION, STOPPED_EMPTY } from "../_lib/copy";
import { timeoutSignal } from "../_lib/fetchJson";
import { speak, stopSpeaking } from "../_lib/speech";
import { EMPTY_IDS, rememberSession, sessionIdsSnapshot, subscribeToStorage } from "../_lib/storage";
import { FOCUS_RING } from "../_lib/styles";
import { activityKey, textOf } from "../_lib/transcript";
import { useChatHistory } from "../_lib/useChatHistory";
import { LATEST_ANSWER_ATTR, useConversationScroll } from "../_lib/useConversationScroll";
import { AssistantMessage, type AnswerEnding } from "./answer/AssistantMessage";
import { ErrorCard } from "./answer/ErrorCard";
import { Composer } from "./Composer";
import { EmptyState } from "./EmptyState";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { Pane } from "./Pane";
import { RenderBoundary } from "./RenderBoundary";
import { SideNav } from "./SideNav";
import { TabBar, type ShellTab } from "./TabBar";
import { WidgetsRail } from "./WidgetsRail";

/**
 * If nothing new arrives for this long while answering, stop waiting and say so (S3). The
 * server caps a whole turn at 100 s, so 90 s of silence means it's stuck, not thinking.
 */
const STALL_MS = 90_000;

/** Hard cap on one chat request, a little above the API's own 150 s limit (`maxDuration`). */
const CHAT_REQUEST_MAX_MS = 170_000;

/** The app. */
export function SneakoscopeApp() {
  // Browser-remembered values, read hydration-safely (the server always renders the defaults).
  const sessionIds = useSyncExternalStore(subscribeToStorage, sessionIdsSnapshot, () => EMPTY_IDS);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [freshness, setFreshness] = useState<string | null>(null);
  const [hubCount, setHubCount] = useState<number | null>(null);
  const [tab, setTab] = useState<ShellTab>("chat");
  /** Changes when another chat is opened or a new one starts (the scroll position resets). */
  const [chatKey, setChatKey] = useState(0);
  /** How turns that ended without an answer ended, by message id (the user's own id when no answer had started). */
  const [endings, setEndings] = useState<Record<string, AnswerEnding>>({});
  /** The always-present screen-reader status line (S7). */
  const [announcement, setAnnouncement] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  /** Why the next abort happens: the watchdog sets "stalled"; anything else counts as the person stopping. */
  const stopReason = useRef<AnswerEnding | null>(null);
  /** Set when asking from another panel on a small screen: focus moves to the conversation once it shows. */
  const focusConversation = useRef(false);

  // sessionId travels with each sendMessage call (see ask); the transport only adds the message text. US units only (D126).
  const transport = useMemo(
    () =>
      new DefaultChatTransport<SneakoscopeUIMessage>({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages, body }) => ({ body: { ...body, message: textOf(messages.at(-1)) } }),
        // Every request has a timeout (Stop still works: its signal is combined with the timeout).
        fetch: (input, init) => fetch(input, { ...init, signal: timeoutSignal(CHAT_REQUEST_MAX_MS, init?.signal ?? undefined) }),
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
    onFinish: ({ message, messages: all, isAbort, isError }) => {
      if (isAbort) {
        const ending = stopReason.current ?? "stopped";
        stopReason.current = null;
        // If no answer had started, the ending belongs to the question (the last message).
        const id = all.some((m) => m.id === message.id) ? message.id : all.at(-1)?.id;
        if (id) setEndings((current) => ({ ...current, [id]: ending }));
        setAnnouncement(ending === "stopped" ? LIVE_STATUS.stopped : LIVE_STATUS.failed);
        return;
      }
      const answered = !isError && message.parts.some((part) => part.type === "data-answer");
      setAnnouncement(answered ? LIVE_STATUS.ready : LIVE_STATUS.failed);
    },
  });
  const busy = status === "submitted" || status === "streaming";
  /** True while the current question came from the mic (its answer will be read aloud). */
  const voiceTurn = useRef(false);

  /** A saved chat arrived: show it (only the newest open request ever gets here, B2). */
  const showSavedChat = useCallback(
    (id: string, saved: SneakoscopeUIMessage[]) => {
      clearError();
      setMessages(saved);
      setSessionId(id);
      setChatKey((key) => key + 1);
      setAnnouncement(LIVE_STATUS.opened);
    },
    [clearError, setMessages],
  );
  const history = useChatHistory(showSavedChat);
  const loadingChat = history.loadingId !== null;

  useConversationScroll(scrollRef, messages, status, chatKey);

  // Stall watchdog (S3): every new part, text or progress step restarts the countdown.
  const activity = busy ? activityKey(messages) : null;
  useEffect(() => {
    if (activity === null) return;
    const timer = setTimeout(() => {
      stopReason.current = "stalled";
      void stop();
    }, STALL_MS);
    return () => clearTimeout(timer);
  }, [activity, stop]);

  /**
   * Sends a question (ignored while an answer is coming or a chat is opening).
   * @param question - the question text.
   * @param byVoice - true in conversation mode (the answer is read aloud).
   */
  const ask = useCallback(
    (question: string, byVoice = false) => {
      if (busy || loadingChat) return;
      stopSpeaking();
      history.cancel(); // clears an old "couldn't open" line
      voiceTurn.current = byVoice;
      stopReason.current = null;
      clearError();
      setAnnouncement(LIVE_STATUS.working);
      void sendMessage({ text: question }, { body: { sessionId } });
    },
    [busy, loadingChat, history, clearError, sendMessage, sessionId],
  );

  // A question asked by voice gets its answer read aloud once it's checked and complete (D127).
  useEffect(() => {
    if (status !== "ready" || !voiceTurn.current) return;
    voiceTurn.current = false;
    const last = messages.at(-1);
    const answer = last?.role === "assistant" ? last.parts.find((part) => part.type === "data-answer") : undefined;
    if (last && answer?.type === "data-answer") speak(last.id, answer.data.answer);
  }, [status, messages]);

  /** Asks the latest question again (B1: only the newest turn offers this, and never while busy). */
  const retryLast = useCallback(() => {
    if (busy || loadingChat) return;
    const index = messages.findLastIndex((m) => m.role === "user");
    const question = index === -1 ? "" : textOf(messages[index]);
    if (!question) return;
    setMessages(messages.slice(0, index));
    stopReason.current = null;
    clearError();
    setAnnouncement(LIVE_STATUS.working);
    void sendMessage({ text: question }, { body: { sessionId } });
  }, [busy, loadingChat, messages, setMessages, clearError, sendMessage, sessionId]);

  /** Starts a fresh chat: stops any answer, cancels any chat still opening. */
  const newChat = useCallback(() => {
    history.cancel();
    stopReason.current = null;
    void stop();
    stopSpeaking();
    clearError();
    setMessages([]);
    setSessionId(null);
    setChatKey((key) => key + 1);
    setTab("chat");
  }, [history, stop, clearError, setMessages]);

  /**
   * Opens a saved chat (waits while an answer is coming; the side nav says so).
   * @param id - the chat's session id.
   */
  const openChat = useCallback(
    (id: string) => {
      setTab("chat");
      stopSpeaking();
      if (busy) return;
      if (id === sessionId) {
        history.cancel(); // back to the chat already shown: drop any other chat still opening
        return;
      }
      history.open(id);
    },
    [busy, history, sessionId],
  );

  /** Asking from the overview (or an alert) switches small screens to the conversation, and moves focus there. */
  const askFromElsewhere = useCallback(
    (question: string) => {
      if (busy || loadingChat) return;
      if (tab !== "chat") focusConversation.current = true;
      setTab("chat");
      ask(question);
    },
    [ask, busy, loadingChat, tab],
  );

  // Once the conversation panel is showing, give it focus (it can't take focus while hidden).
  useEffect(() => {
    if (tab !== "chat" || !focusConversation.current) return;
    focusConversation.current = false;
    scrollRef.current?.focus({ preventScroll: true });
  }, [tab]);

  /**
   * Shows the data freshness in the header once the overview has loaded.
   * @param dataStatus - the overview's data status.
   */
  const onStatus = useCallback((dataStatus: WidgetsData["dataStatus"]) => {
    setFreshness(`${dataStatus.hubCount} hubs · weather through ${dataStatus.weatherThrough}`);
    setHubCount(dataStatus.hubCount);
  }, []);

  const completedAnswers = messages.filter((m) => m.parts.some((part) => part.type === "data-answer")).length;
  const lastMessage = messages.at(-1);
  const lastIndex = messages.length - 1;
  // What to show under a question that has no answer message (the request failed or was stopped before any answer began).
  const pendingEnding = lastMessage?.role === "user" && !busy ? endings[lastMessage.id] : undefined;

  /**
   * Small screens show one panel at a time (bottom switcher); desktop (xl, 1280 px+) shows all three (D125).
   * @param panel - the panel.
   * @returns its display classes.
   */
  const show = (panel: ShellTab) => (tab === panel ? "flex" : "hidden xl:flex");

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Header freshness={freshness} />
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <div className="mx-auto grid min-h-0 w-full max-w-[1680px] flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-3 p-3 xl:grid-cols-[16rem_minmax(0,1fr)_22rem]">
        <Pane title="Your chats" className={show("chats")}>
          <SideNav
            sessionIds={sessionIds}
            activeId={sessionId}
            openingId={history.loadingId}
            busy={busy}
            onOpen={openChat}
            onNew={newChat}
            refreshKey={completedAnswers}
          />
        </Pane>

        <Pane
          title="Conversation"
          className={show("chat")}
          bodyRef={scrollRef}
          busy={loadingChat}
          footer={<Composer busy={busy} locked={loadingChat ? OPENING_CHAT : null} onSend={ask} onStop={() => void stop()} />}
        >
          <div className="space-y-4">
            {loadingChat && <p className="text-sm text-slate-400">{OPENING_CHAT}</p>}
            {history.failedId && (
              <p className="flex flex-wrap items-center gap-2 text-sm text-slate-300" role="alert">
                {CHAT_OPEN_FAILED}
                <button
                  type="button"
                  onClick={() => openChat(history.failedId!)}
                  className={`rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-slate-100 transition hover:bg-white/10 ${FOCUS_RING}`}
                >
                  Try again
                </button>
              </p>
            )}
            {messages.length === 0 && !loadingChat && <EmptyState onAsk={ask} hubCount={hubCount} />}
            {messages.map((message, index) => {
              const isLast = index === lastIndex;
              if (message.role === "user") {
                return (
                  <div key={message.id} className="flex justify-end">
                    <p className="max-w-[80%] whitespace-pre-wrap wrap-anywhere rounded-2xl rounded-br-md bg-sky-400/15 px-4 py-2.5 text-[15px] text-slate-100">
                      {textOf(message)}
                    </p>
                  </div>
                );
              }
              return (
                <div key={message.id} {...(isLast ? { [LATEST_ANSWER_ATTR]: "" } : {})}>
                  <RenderBoundary message={MESSAGE_FAILED} where="AssistantMessage">
                    <AssistantMessage
                      message={message}
                      isStreaming={busy && isLast}
                      ending={endings[message.id] ?? null}
                      interruption={isLast && status === "error" && error ? requestError(error, true) : null}
                      busy={busy || loadingChat}
                      onAsk={ask}
                      onRetry={isLast && !busy ? retryLast : undefined}
                    />
                  </RenderBoundary>
                </div>
              );
            })}
            {status === "submitted" && lastMessage?.role === "user" && (
              <div className="glass rounded-2xl p-5 text-sm text-slate-400">{READING_QUESTION}</div>
            )}
            {/* One card per failure (B5): the shell's only when no answer message exists to carry it. */}
            {error && lastMessage?.role !== "assistant" && <ErrorCard error={requestError(error)} onRetry={retryLast} />}
            {!error && pendingEnding === "stalled" && <ErrorCard error={ANSWER_STALLED} onRetry={retryLast} />}
            {!error && pendingEnding === "stopped" && (
              <p className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                {STOPPED_EMPTY}
                <button
                  type="button"
                  onClick={retryLast}
                  className={`rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-slate-200 transition hover:bg-white/10 ${FOCUS_RING}`}
                >
                  Ask again
                </button>
              </p>
            )}
          </div>
        </Pane>

        <Pane title="Overview" className={show("overview")}>
          <WidgetsRail onAsk={askFromElsewhere} onStatus={onStatus} busy={busy || loadingChat} />
          <Footer className="mt-3 px-1 xl:hidden" />
        </Pane>
      </div>
      <Footer className="hidden shrink-0 xl:block" />
      <TabBar tab={tab} onChange={setTab} className="xl:hidden" />
    </div>
  );
}
