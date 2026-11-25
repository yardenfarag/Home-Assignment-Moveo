/**
 * @module core/db/chatRepository
 *
 * Server-side conversation memory (D25, G7): sessions and their messages,
 * including tool calls and results, so follow-ups reuse exact numbers.
 */
import { modelMessageSchema, type ModelMessage } from "ai";
import { z } from "zod";
import type { FinalAnswer } from "../agent/answerSchema";
import { BoundaryError } from "../errors/boundaryError";
import type { Json } from "./database.types";
import { getDb, type Db } from "./client";

/** Shorthand for a database failure in this module. */
function dbError(functionName: string, what: string, error: { message: string }): BoundaryError {
  return new BoundaryError({
    name: "SupabaseQueryError",
    message: `${what}: ${error.message}`,
    functionName,
    boundary: "database",
    cause: error,
  });
}

/**
 * Returns an existing session id, or creates a new session.
 * @param sessionId - id from the browser, if any.
 * @param db - database client (injectable).
 * @returns the session id to use.
 * @throws BoundaryError (database) on failure.
 */
export async function ensureSession(sessionId: string | null, db: Db = getDb()): Promise<string> {
  if (sessionId && z.uuid().safeParse(sessionId).success) {
    const { data, error } = await db.from("chat_sessions").select("id").eq("id", sessionId).maybeSingle();
    if (error) throw dbError("ensureSession", "Could not read the chat session", error);
    if (data) return data.id;
  }
  const { data, error } = await db.from("chat_sessions").insert({}).select("id").single();
  if (error) throw dbError("ensureSession", "Could not create a chat session", error);
  return data.id;
}

/**
 * Loads the last `turns` turns of a conversation as model messages (oldest first).
 * A turn starts at a user message.
 * @param sessionId - session id.
 * @param turns - how many recent turns to include.
 * @param db - database client (injectable).
 * @returns the messages, validated with the AI SDK's message schema.
 * @throws BoundaryError (database) when a query fails or a stored message is malformed.
 */
export async function loadHistory(sessionId: string, turns: number, db: Db = getDb()): Promise<ModelMessage[]> {
  const starts = await db
    .from("chat_messages")
    .select("created_at")
    .eq("session_id", sessionId)
    .eq("role", "user")
    .order("created_at", { ascending: false })
    .limit(turns);
  if (starts.error) throw dbError("loadHistory", "Could not read chat history", starts.error);
  if (starts.data.length === 0) return [];
  const from = starts.data[starts.data.length - 1].created_at;

  const { data, error } = await db
    .from("chat_messages")
    .select("content")
    .eq("session_id", sessionId)
    .gte("created_at", from)
    .order("created_at", { ascending: true });
  if (error) throw dbError("loadHistory", "Could not read chat history", error);
  const parsed = z.array(modelMessageSchema).safeParse(data.map((row) => row.content));
  if (!parsed.success) {
    throw new BoundaryError({
      name: "ChatHistoryValidationError",
      message: `Stored messages of session ${sessionId} are malformed`,
      functionName: "loadHistory",
      boundary: "database",
      cause: parsed.error,
    });
  }
  return parsed.data;
}

/**
 * Saves one turn. Rows get strictly increasing timestamps (1 ms apart) so their
 * order is unambiguous — a batch insert would otherwise give them all the same `now()`.
 * @param sessionId - session id.
 * @param messages - the turn's messages (user, assistant, tool …).
 * @param answer - the final checked answer (stored on the last assistant message).
 * @param model - model id.
 * @param db - database client (injectable).
 * @throws BoundaryError (database) on failure.
 */
export async function saveTurn(
  sessionId: string,
  messages: ModelMessage[],
  answer: FinalAnswer,
  model: string,
  db: Db = getDb(),
): Promise<void> {
  const base = Date.now();
  const lastAssistant = messages.map((m) => m.role).lastIndexOf("assistant");
  const rows = messages
    .filter((m) => m.role !== "system")
    .map((message, index) => ({
      session_id: sessionId,
      role: message.role,
      content: message as unknown as Json,
      answer: index === lastAssistant ? (answer as unknown as Json) : null,
      model: message.role === "assistant" ? model : null,
      created_at: new Date(base + index).toISOString(),
    }));
  const { error } = await db.from("chat_messages").insert(rows);
  if (error) throw dbError("saveTurn", "Could not save the conversation", error);

  const firstUser = messages.find((m) => m.role === "user");
  const title = typeof firstUser?.content === "string" ? firstUser.content.slice(0, 80) : null;
  const session = await db
    .from("chat_sessions")
    .update({ last_message_at: new Date(base + rows.length).toISOString() })
    .eq("id", sessionId);
  if (session.error) throw dbError("saveTurn", "Could not update the chat session", session.error);
  if (title) await db.from("chat_sessions").update({ title }).eq("id", sessionId).is("title", null);
}
