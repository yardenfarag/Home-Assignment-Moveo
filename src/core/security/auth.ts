/**
 * @module core/security/auth
 *
 * The one access check left (D113): the nightly job's route needs
 * `Authorization: Bearer <CRON_SECRET>`, which Vercel Cron sends automatically.
 * The app itself is open: there is no site login.
 * The comparison is constant-time, so response timing doesn't reveal the secret.
 */
import type { CronEnv } from "../config/env";

/**
 * Compares two strings in time that depends only on their lengths.
 * @param a - first string.
 * @param b - second string.
 * @returns true when equal.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/**
 * Checks the nightly job's `Authorization: Bearer <CRON_SECRET>` header.
 * @param header - the request's Authorization header (or null).
 * @param env - the cron secret.
 * @returns true when the secret matches.
 */
export function isCronAuthorized(header: string | null, env: CronEnv): boolean {
  return constantTimeEqual(header ?? "", `Bearer ${env.CRON_SECRET}`);
}
