/**
 * @module core/security/auth
 *
 * Access checks shared by `src/proxy.ts` AND every API route (A2: two layers,
 * because Next's docs say proxy alone is not a full authorization solution).
 * - Site: HTTP Basic Auth with APP_USERNAME / APP_PASSWORD (Q16).
 * - Cron: `Authorization: Bearer <CRON_SECRET>` (sent by Vercel Cron).
 * Comparisons are constant-time so response timing doesn't reveal secrets.
 * Uses only web-standard APIs (atob), so it runs in any runtime.
 */
import type { AccessEnv } from "../config/env";

/** Username and password from a Basic Auth header. */
export interface BasicCredentials {
  username: string;
  password: string;
}

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
 * Parses `Authorization: Basic base64(user:password)`.
 * @param header - the Authorization header value (or null).
 * @returns the credentials, or null when missing/malformed.
 */
export function parseBasicAuth(header: string | null): BasicCredentials | null {
  if (!header?.startsWith("Basic ")) return null;
  let decoded: string;
  try {
    decoded = atob(header.slice("Basic ".length).trim());
  } catch {
    return null;
  }
  const separator = decoded.indexOf(":");
  if (separator < 0) return null;
  return { username: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
}

/**
 * True when the request carries the site's username and password.
 * @param header - the Authorization header value.
 * @param access - configured credentials.
 * @returns whether access is granted.
 */
export function isSiteAuthorized(header: string | null, access: Pick<AccessEnv, "APP_USERNAME" | "APP_PASSWORD">): boolean {
  const credentials = parseBasicAuth(header);
  if (!credentials) return false;
  // Evaluate both comparisons (no short-circuit) so timing doesn't reveal which part was wrong.
  const userOk = constantTimeEqual(credentials.username, access.APP_USERNAME);
  const passOk = constantTimeEqual(credentials.password, access.APP_PASSWORD);
  return userOk && passOk;
}

/**
 * True when the request carries the cron secret as a Bearer token.
 * @param header - the Authorization header value.
 * @param access - configured cron secret.
 * @returns whether the cron call is allowed.
 */
export function isCronAuthorized(header: string | null, access: Pick<AccessEnv, "CRON_SECRET">): boolean {
  return constantTimeEqual(header ?? "", `Bearer ${access.CRON_SECRET}`);
}
