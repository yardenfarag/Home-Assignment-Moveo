/**
 * GET /api/chat/history?sessionId=<uuid> — reopen a past chat (U5b): its
 * questions and the validated answers exactly as they were shown.
 */
import { connection } from "next/server";
import { z } from "zod";
import { loadTranscript } from "@/core/db/chatTranscript";
import { INVALID_CHAT_LINK, userError } from "@/core/errors/userErrors";
import { errorResponse, failure, json } from "../../_lib/http";

/**
 * Returns one session's transcript.
 * @param request - the HTTP request.
 * @returns JSON `{ sessionId, turns }` or a friendly error.
 */
export async function GET(request: Request): Promise<Response> {
  await connection(); // per-request only; keep outside try/catch (D78)
  try {
    const parsed = z.uuid().safeParse(new URL(request.url).searchParams.get("sessionId"));
    if (!parsed.success) return errorResponse(userError("invalid_request", INVALID_CHAT_LINK.message, INVALID_CHAT_LINK.hint));
    return json({ sessionId: parsed.data, turns: await loadTranscript(parsed.data) });
  } catch (error) {
    return failure(error, "GET /api/chat/history");
  }
}
