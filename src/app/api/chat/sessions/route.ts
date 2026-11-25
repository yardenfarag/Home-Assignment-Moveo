/**
 * GET /api/chat/sessions?ids=a,b,c — titles and dates of the chats THIS browser
 * remembers (U5b). Unknown or empty sessions are left out.
 */
import { connection } from "next/server";
import { z } from "zod";
import { listSessions } from "@/core/db/chatTranscript";
import { failure, json, requireSiteAuth } from "../../_lib/http";

/** At most this many ids per request. */
const MAX_IDS = 50;

/**
 * Lists the requested sessions.
 * @param request - the HTTP request.
 * @returns JSON `{ sessions }` or a friendly error.
 */
export async function GET(request: Request): Promise<Response> {
  await connection(); // per-request only; keep outside try/catch (D78)
  try {
    const denied = requireSiteAuth(request);
    if (denied) return denied;
    const raw = new URL(request.url).searchParams.get("ids") ?? "";
    const ids = z.array(z.uuid()).max(MAX_IDS).parse(raw.split(",").filter(Boolean));
    return json({ sessions: await listSessions(ids) });
  } catch (error) {
    return failure(error, "GET /api/chat/sessions");
  }
}
