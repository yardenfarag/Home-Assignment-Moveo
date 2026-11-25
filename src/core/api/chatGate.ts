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

/**
 * Checks the limits for one chat request.
 * @param headers - the request headers (client IP, operator key).
 * @param deps - counting, logging, secret, clock.
 * @returns a friendly error to send back, or null to go ahead.
 */
export async function checkChatGate(headers: Headers, deps: ChatGateDeps): Promise<UserError | null> {
  if (constantTimeEqual(headers.get(OPERATOR_HEADER) ?? "", deps.secret)) return null;

  const now = deps.now();
  const day = now.toISOString().slice(0, 10);
  const visitor = visitorKey(clientIp(headers), day, deps.secret);
  const startOfDay = `${day}T00:00:00.000Z`;
  const burstStart = new Date(now.getTime() - RATE_LIMITS.visitorBurst.windowMinutes * 60_000).toISOString();

  let counts: RequestCounts;
  try {
    const [visitorBurst, visitorDaily, globalDaily] = await Promise.all([
      deps.countEvents({ eventType: CHAT_REQUEST_EVENT, since: burstStart, visitor }),
      deps.countEvents({ eventType: CHAT_REQUEST_EVENT, since: startOfDay, visitor }),
      deps.countEvents({ eventType: CHAT_REQUEST_EVENT, since: startOfDay }),
    ]);
    counts = { visitorBurst, visitorDaily, globalDaily };
  } catch (error) {
    console.error(
      formatBoundaryMessage({
        name: "RateLimitCountError",
        message: `Could not count requests, letting this one through: ${describeUnknownError(error)}`,
        functionName: "checkChatGate",
        boundary: "database",
      }),
    );
    return null;
  }

  const decision = decideRateLimit(counts);
  if (!decision.allowed) {
    await deps.recordEvent({
      eventType: "chat.rate_limited",
      source: "guard",
      level: "warn",
      message: `limit ${decision.limit} hit`,
      payload: { visitor, limit: decision.limit, ...counts },
    });
    return userError(ERROR_FOR[decision.limit]);
  }
  await deps.recordEvent({ eventType: CHAT_REQUEST_EVENT, source: "api", payload: { visitor } });
  return null;
}
