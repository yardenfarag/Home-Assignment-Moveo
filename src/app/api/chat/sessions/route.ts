/**
 * GET /api/chat/sessions?ids=a,b,c — titles and dates of the chats THIS browser
 * remembers (U5b). Unknown or empty sessions are left out, and so are ids that aren't valid:
 * one bad saved id must not hide the whole list.
 */
import { connection } from "next/server";
import { z } from "zod";
import { REMEMBERED_CHATS_LIMIT } from "@/core/agent/config";
import { listSessions } from "@/core/db/chatTranscript";
import { failure, json } from "../../_lib/http";

/**
 * Lists the requested sessions.
 * @param request - the HTTP request.
 * @returns JSON `{ sessions }` or a friendly error.
 */
export async function GET(request: Request): Promise<Response> {
  await connection(); // per-request only; keep outside try/catch (D78)
  try {
    const raw = new URL(request.url).searchParams.get("ids") ?? "";
    const ids = raw
      .split(",")
      .filter((id) => z.uuid().safeParse(id).success)
      .slice(0, REMEMBERED_CHATS_LIMIT);
    return json({ sessions: await listSessions(ids) });
  } catch (error) {
    return failure(error, "GET /api/chat/sessions");
  }
}
