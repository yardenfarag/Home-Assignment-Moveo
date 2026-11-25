/**
 * @module core/db/answerCacheRepository
 *
 * Supabase store for the answer cache (Step 18, D136): table `answer_cache`.
 */
import { modelMessageSchema } from "ai";
import { z } from "zod";
import type { AnswerCacheEntry, AnswerCacheStore, CachedAnswer } from "../agent/answerCache";
import type { FinalAnswer } from "../agent/answerSchema";
import { BoundaryError } from "../errors/boundaryError";
import type { Json } from "./database.types";
import { getDb, type Db } from "./client";

/**
 * Wraps a failed query in the database boundary error.
 * @param functionName - where it failed.
 * @param error - the Supabase error.
 * @returns the error to throw.
 */
function cacheError(functionName: string, error: { message: string }): BoundaryError {
  return new BoundaryError({ name: "AnswerCacheError", message: error.message, functionName, boundary: "database", cause: error });
}

/**
 * Reads the unexpired entry for a key.
 * @param key - the cache key.
 * @param now - the current time.
 * @param db - database client (injectable).
 * @returns the cached answer, or null (also when the stored messages are malformed).
 * @throws BoundaryError (database) when the query fails.
 */
export async function getCachedAnswer(key: string, now: Date, db: Db = getDb()): Promise<CachedAnswer | null> {
  const { data, error } = await db
    .from("answer_cache")
    .select("answer, messages")
    .eq("cache_key", key)
    .gt("expires_at", now.toISOString())
    .maybeSingle();
  if (error) throw cacheError("getCachedAnswer", error);
  if (!data) return null;
  const messages = z.array(modelMessageSchema).safeParse(data.messages);
  if (!messages.success) return null; // an unreadable entry is a miss, not an error
  return { answer: data.answer as unknown as FinalAnswer, messages: messages.data };
}

/**
 * Stores (or replaces) an entry.
 * @param entry - the entry.
 * @param db - database client (injectable).
 * @throws BoundaryError (database) when the write fails.
 */
export async function putCachedAnswer(entry: AnswerCacheEntry, db: Db = getDb()): Promise<void> {
  const { error } = await db.from("answer_cache").upsert(
    {
      cache_key: entry.key,
      question: entry.question,
      scores_version: entry.scoresVersion,
      model: entry.model,
      answer: entry.answer as unknown as Json,
      messages: entry.messages as unknown as Json,
      expires_at: entry.expiresAt,
    },
    { onConflict: "cache_key" },
  );
  if (error) throw cacheError("putCachedAnswer", error);
}

/** The Supabase-backed store. */
export const supabaseAnswerCache: AnswerCacheStore = {
  get: (key, now) => getCachedAnswer(key, now),
  put: (entry) => putCachedAnswer(entry),
};
