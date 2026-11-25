/**
 * @module core/agent/answerCache
 *
 * The answer cache (Step 18, D136), kept simple on purpose:
 * - only the FIRST question of a new conversation is cached (a follow-up depends on the
 *   conversation, so it's never reused);
 * - the key is the normalized question + the scores version + the model + today, so a nightly
 *   re-score, a model change or a new day ("last year" moves on Jan 1) all start fresh;
 * - entries expire after `ANSWER_CACHE.ttlHours`.
 * Pure logic; the Supabase store lives in `db/answerCacheRepository.ts`.
 */
import { createHash } from "node:crypto";
import type { ModelMessage } from "ai";
import type { StoredSnapshot } from "../db/scoresRepository";
import { SCORING_VERSION } from "../scoring/config";
import type { FinalAnswer } from "./answerSchema";

/** Answer-cache settings: the single source of truth. */
export const ANSWER_CACHE = {
  /** How long a cached answer may be reused. */
  ttlHours: 24,
} as const;

/** A cached answer and the turn's messages (so follow-ups can reuse its tool results). */
export interface CachedAnswer {
  answer: FinalAnswer;
  messages: ModelMessage[];
}

/** One entry to store. */
export interface AnswerCacheEntry extends CachedAnswer {
  key: string;
  question: string;
  scoresVersion: string;
  model: string;
  expiresAt: string;
}

/** Where cached answers live (injectable; the app uses Supabase). */
export interface AnswerCacheStore {
  /** The unexpired entry for a key, or null. */
  get: (key: string, now: Date) => Promise<CachedAnswer | null>;
  /** Stores (or replaces) an entry. */
  put: (entry: AnswerCacheEntry) => Promise<void>;
}

/**
 * The question in a canonical form: case, spacing, curly quotes and trailing punctuation don't
 * make a different question.
 * @param question - the question as typed.
 * @returns the normalized question.
 */
export function normalizeQuestion(question: string): string {
  return question
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\s?.!]+$/, "");
}

/**
 * The version of the scores an answer was built on: the scoring version and the newest run.
 * @param snapshots - the latest snapshots (one per hub).
 * @returns e.g. `v2:485949c8-…`.
 */
export function scoresVersionOf(snapshots: Iterable<StoredSnapshot>): string {
  let newest: StoredSnapshot | null = null;
  for (const snapshot of snapshots) if (!newest || snapshot.createdAt > newest.createdAt) newest = snapshot;
  return `${SCORING_VERSION}:${newest?.runId ?? "none"}`;
}

/**
 * The cache key.
 * @param parts - normalized question, scores version, model id, today (`YYYY-MM-DD`).
 * @returns a sha256 hex digest.
 */
export function answerCacheKey(parts: { question: string; scoresVersion: string; model: string; today: string }): string {
  return createHash("sha256").update([parts.question, parts.scoresVersion, parts.model, parts.today].join("\n")).digest("hex");
}

/**
 * When an entry stored now expires.
 * @param now - the current time.
 * @returns ISO timestamp.
 */
export function cacheExpiry(now: Date): string {
  return new Date(now.getTime() + ANSWER_CACHE.ttlHours * 3_600_000).toISOString();
}
