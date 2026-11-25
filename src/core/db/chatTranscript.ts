/**
 * @module core/db/chatTranscript
 *
 * Reads past conversations for the chat-history side nav (U5b): session titles
 * for the ids THIS browser remembers, and a session's questions + validated answers.
 */
import type { FinalAnswer } from "../agent/answerSchema";
import { RETRY_FEEDBACK_PREFIX } from "../agent/config";
import { BoundaryError } from "../errors/boundaryError";
import type { Json } from "./database.types";
import { getDb, type Db } from "./client";

/** One past question and its validated answer. */
export interface TranscriptTurn {
  question: string;
  answer: FinalAnswer;
  askedAt: string;
}

/** A row of chat_messages, as needed here. */
export interface TranscriptRow {
  role: string;
  content: Json;
  answer: Json | null;
  created_at: string;
}

/** A session summary for the side nav. */
export interface SessionSummary {
  id: string;
  title: string | null;
  lastMessageAt: string | null;
}

/** Text of a stored user message, or null when it isn't plain text. */
function userText(content: Json): string | null {
  const text = (content as { content?: unknown } | null)?.content;
  return typeof text === "string" ? text : null;
}

/**
 * Pairs each real question with the validated answer that followed it.
 * Retry feedback (sent to the model after a failed validation) is hidden.
 * @param rows - a session's messages, oldest first.
 * @returns the turns, oldest first.
 */
export function turnsFromRows(rows: TranscriptRow[]): TranscriptTurn[] {
  const turns: TranscriptTurn[] = [];
  let pending: { question: string; askedAt: string } | null = null;
  for (const row of rows) {
    if (row.role === "user") {
      const text = userText(row.content);
      if (text !== null && !text.startsWith(RETRY_FEEDBACK_PREFIX)) pending = { question: text, askedAt: row.created_at };
    } else if (row.answer && pending) {
      turns.push({ question: pending.question, answer: row.answer as unknown as FinalAnswer, askedAt: pending.askedAt });
      pending = null;
    }
  }
  return turns;
}

/**
 * Reads one session's transcript.
 * @param sessionId - the session.
 * @param db - database client (injectable).
 * @returns the turns (empty for unknown sessions).
 * @throws BoundaryError (database) on failure.
 */
export async function loadTranscript(sessionId: string, db: Db = getDb()): Promise<TranscriptTurn[]> {
  const { data, error } = await db
    .from("chat_messages")
    .select("role, content, answer, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) {
    throw new BoundaryError({
      name: "SupabaseQueryError",
      message: `Could not read the transcript: ${error.message}`,
      functionName: "loadTranscript",
      boundary: "database",
      cause: error,
    });
  }
  return turnsFromRows(data);
}

/**
 * Titles and dates for the given sessions (only those that exist), newest first.
 * @param ids - session ids this browser remembers.
 * @param db - database client (injectable).
 * @returns the summaries.
 * @throws BoundaryError (database) on failure.
 */
export async function listSessions(ids: string[], db: Db = getDb()): Promise<SessionSummary[]> {
  if (ids.length === 0) return [];
  const { data, error } = await db
    .from("chat_sessions")
    .select("id, title, last_message_at")
    .in("id", ids)
    .not("last_message_at", "is", null)
    .order("last_message_at", { ascending: false });
  if (error) {
    throw new BoundaryError({
      name: "SupabaseQueryError",
      message: `Could not list chat sessions: ${error.message}`,
      functionName: "listSessions",
      boundary: "database",
      cause: error,
    });
  }
  return data.map((row) => ({ id: row.id, title: row.title, lastMessageAt: row.last_message_at }));
}
