/**
 * @module core/api/chatGate
 *
 * Runs before every `POST /api/chat` (D114): counts the visitor's recent questions
 * and today's total, refuses with a friendly error when a limit is hit, and
 * otherwise records the request so the next check counts it.
 *
 * - The operator (our eval script) can skip the limits by sending the cron secret
 *   in `x-sneakoscope-operator-key`; it's compared in constant time.
 * - If counting fails (database trouble), the request is let through and the
 *   problem is logged: the agent needs the database anyway, so it will fail with
 *   its own friendly error, and a broken counter shouldn't lock everyone out.
 */
import { formatBoundaryMessage, describeUnknownError } from "../errors/boundaryError";
import { userError, type UserError } from "../errors/userErrors";
import type { EventCountQuery, NewEvent } from "../db/eventsRepository";
import { constantTimeEqual } from "../security/auth";
import { CHAT_REQUEST_EVENT, RATE_LIMITS, clientIp, decideRateLimit, visitorKey, type RequestCounts } from "../security/rateLimit";

/** Header the eval script uses to skip the limits. */
export const OPERATOR_HEADER = "x-sneakoscope-operator-key";

/** What the gate needs (injectable for tests). */
export interface ChatGateDeps {
  countEvents: (query: EventCountQuery) => Promise<number>;
  recordEvent: (event: NewEvent) => Promise<boolean>;
  /** The server secret: keys the visitor hash and unlocks the operator bypass. */
  secret: string;
  now: () => Date;
}

/** Which user error each limit maps to. */
const ERROR_FOR: Record<keyof RequestCounts, "too_many_requests" | "daily_limit"> = {
  visitorBurst: "too_many_requests",
  visitorDaily: "daily_limit",
  globalDaily: "daily_limit",
};

/** Event recorded when a request is refused (at most once per visitor per burst window). */
const RATE_LIMITED_EVENT = "chat.rate_limited";

/**
 * Counts the visitor's recent and daily requests and today's total.
 * @param deps - the counter.
 * @param visitor - the visitor key.
 * @param since - start of the burst window and of the UTC day (ISO).
 * @returns the three counts.
 * @throws BoundaryError (database) when counting fails.
 */
async function countRequests(deps: Pick<ChatGateDeps, "countEvents">, visitor: string, since: { burst: string; day: string }): Promise<RequestCounts> {
  const [visitorBurst, visitorDaily, globalDaily] = await Promise.all([
    deps.countEvents({ eventType: CHAT_REQUEST_EVENT, since: since.burst, visitor }),
    deps.countEvents({ eventType: CHAT_REQUEST_EVENT, since: since.day, visitor }),
    deps.countEvents({ eventType: CHAT_REQUEST_EVENT, since: since.day }),
  ]);
  return { visitorBurst, visitorDaily, globalDaily };
}

/**
 * Logs a failed count in the boundary format (the request is then let through).
 * @param error - what was thrown.
 */
function logCountFailure(error: unknown): void {
  console.error(
    formatBoundaryMessage({
      name: "RateLimitCountError",
      message: `Could not count requests, letting this one through: ${describeUnknownError(error)}`,
      functionName: "checkChatGate",
      boundary: "database",
    }),
  );
}

/**
 * Checks the limits for one chat request.
 *
 * Count, record, then count again: parallel requests can all pass the first count before any
 * of them is recorded, so the second count (which includes this request) catches the overshoot.
 * In that race every request over the limit is refused, so the limit is never exceeded (at worst
 * a request right at the edge is refused too).
 * @param headers - the request headers (client IP, operator key).
 * @param deps - counting, logging, secret, clock.
 * @returns a friendly error to send back, or null to go ahead.
 */
export async function checkChatGate(headers: Headers, deps: ChatGateDeps): Promise<UserError | null> {
  if (constantTimeEqual(headers.get(OPERATOR_HEADER) ?? "", deps.secret)) return null;

  const now = deps.now();
  const day = now.toISOString().slice(0, 10);
  const visitor = visitorKey(clientIp(headers), day, deps.secret);
  const since = { day: `${day}T00:00:00.000Z`, burst: new Date(now.getTime() - RATE_LIMITS.visitorBurst.windowMinutes * 60_000).toISOString() };

  let counts: RequestCounts;
  try {
    counts = await countRequests(deps, visitor, since);
  } catch (error) {
    logCountFailure(error);
    return null;
  }

  const decision = decideRateLimit(counts);
  if (!decision.allowed) {
    // Log a refusal once per visitor per window: a script hammering the endpoint mustn't grow the table.
    const alreadyLogged = await deps.countEvents({ eventType: RATE_LIMITED_EVENT, since: since.burst, visitor }).catch(() => 0);
    if (alreadyLogged === 0) {
      await deps.recordEvent({ eventType: RATE_LIMITED_EVENT, source: "guard", level: "warn", message: `limit ${decision.limit} hit`, payload: { visitor, limit: decision.limit, ...counts } });
    }
    return userError(ERROR_FOR[decision.limit]);
  }

  // recordEvent logs its own failure; an unrecorded request can't be counted, so (as with a failed
  // count) it's let through rather than locking everyone out.
  if (!(await deps.recordEvent({ eventType: CHAT_REQUEST_EVENT, source: "api", payload: { visitor } }))) return null;
  try {
    const after = await countRequests(deps, visitor, since);
    const recheck = decideRateLimit({ visitorBurst: after.visitorBurst - 1, visitorDaily: after.visitorDaily - 1, globalDaily: after.globalDaily - 1 });
    if (!recheck.allowed) return userError(ERROR_FOR[recheck.limit]);
  } catch (error) {
    logCountFailure(error);
  }
  return null;
}
