/**
 * @module core/security/rateLimit
 *
 * Request limits for the one route that costs money, `POST /api/chat` (D114).
 * The app has no login (D113), so these keep one visitor, or a script, from
 * spending the whole OpenRouter budget:
 * - per visitor: a burst limit and a daily limit;
 * - for everyone together: a daily cap (V6).
 * A "visitor" is a keyed hash of the IP address that changes every day, so no
 * raw IP is stored and visitors can't be followed from one day to the next.
 * Pure functions only; the counting happens in the API gate.
 */
import { createHmac } from "node:crypto";

/** The limits: the single source of truth. */
export const RATE_LIMITS = {
  /** Questions one visitor may ask within a short window. */
  visitorBurst: { max: 20, windowMinutes: 10 },
  /** Questions one visitor may ask per UTC day. */
  visitorDaily: { max: 100 },
  /** Questions all visitors together may ask per UTC day (~$3 at ~$0.01 per answer). */
  globalDaily: { max: 300 },
} as const;

/** Event type recorded for every accepted chat request (what the limits count). */
export const CHAT_REQUEST_EVENT = "chat.request";

/** How many requests were already accepted, per limit. */
export interface RequestCounts {
  visitorBurst: number;
  visitorDaily: number;
  globalDaily: number;
}

/** The outcome: allowed, or which limit was hit. */
export type RateLimitDecision = { allowed: true } | { allowed: false; limit: keyof RequestCounts };

/**
 * Decides whether one more request may go through. The daily cap for everyone
 * is checked first, so its message wins when both apply.
 * @param counts - requests already accepted in each window.
 * @returns the decision.
 */
export function decideRateLimit(counts: RequestCounts): RateLimitDecision {
  if (counts.globalDaily >= RATE_LIMITS.globalDaily.max) return { allowed: false, limit: "globalDaily" };
  if (counts.visitorDaily >= RATE_LIMITS.visitorDaily.max) return { allowed: false, limit: "visitorDaily" };
  if (counts.visitorBurst >= RATE_LIMITS.visitorBurst.max) return { allowed: false, limit: "visitorBurst" };
  return { allowed: true };
}

/**
 * The visitor key: an HMAC of the IP and the UTC day. Without the secret it can't
 * be turned back into an IP, and it changes every day.
 * @param ip - the client IP (or "unknown").
 * @param day - the UTC day, `YYYY-MM-DD`.
 * @param secret - a server secret (the cron secret).
 * @returns a 32-character hex key.
 */
export function visitorKey(ip: string, day: string, secret: string): string {
  return createHmac("sha256", secret).update(`${day}:${ip}`).digest("hex").slice(0, 32);
}

/**
 * The client IP behind Vercel's proxy: the first address in `x-forwarded-for`
 * (Vercel sets this header itself), then `x-real-ip`.
 * @param headers - the request headers.
 * @returns the IP, or "unknown" when absent (all unknowns share one bucket).
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}
