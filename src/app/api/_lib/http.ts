/**
 * @module app/api/_lib/http
 *
 * Shared plumbing for API routes (the `_lib` folder is private — not a route):
 * auth checks (second layer behind proxy.ts, A2) and friendly JSON errors (A4).
 */
import { getAccessEnv } from "@/core/config/env";
import { describeUnknownError, formatBoundaryMessage } from "@/core/errors/boundaryError";
import { toUserError, userError, type UserError } from "@/core/errors/userErrors";
import { isCronAuthorized, isSiteAuthorized } from "@/core/security/auth";

/** Never cache API responses: they're per-user or change nightly. */
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * JSON response with no caching.
 * @param body - response body.
 * @param status - HTTP status.
 * @returns the response.
 */
export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

/**
 * Friendly error response `{ error: { code, message, hint, retryable } }`.
 * @param error - the user error.
 * @returns the response.
 */
export function errorResponse(error: UserError): Response {
  const { status, ...body } = error;
  const headers: Record<string, string> = { ...NO_STORE };
  if (status === 401) headers["WWW-Authenticate"] = 'Basic realm="The Daily Prophet", charset="UTF-8"';
  return Response.json({ error: body }, { status, headers });
}

/**
 * Logs an unexpected failure (technical detail stays server-side) and returns the friendly response.
 * @param error - what was thrown.
 * @param functionName - the route function, for the log line.
 * @returns the error response.
 */
export function failure(error: unknown, functionName: string): Response {
  console.error(
    formatBoundaryMessage({
      name: error instanceof Error ? error.name : "UnknownError",
      message: describeUnknownError(error),
      functionName,
      boundary: "apiRoute",
    }),
  );
  return errorResponse(toUserError(error));
}

/**
 * Second auth layer for site routes.
 * @param request - the incoming request.
 * @returns a 401 response when not signed in, otherwise null.
 */
export function requireSiteAuth(request: Request): Response | null {
  return isSiteAuthorized(request.headers.get("authorization"), getAccessEnv()) ? null : errorResponse(userError("unauthorized"));
}

/**
 * Auth for the cron route (Bearer CRON_SECRET).
 * @param request - the incoming request.
 * @returns a 401 response when the secret is wrong, otherwise null.
 */
export function requireCronAuth(request: Request): Response | null {
  return isCronAuthorized(request.headers.get("authorization"), getAccessEnv()) ? null : errorResponse(userError("unauthorized"));
}
