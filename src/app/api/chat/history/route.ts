/**
 * GET /api/chat/history?sessionId=<uuid> — reopen a past chat (U5b): its
 * questions and the validated answers exactly as they were shown.
 */
import { connection } from "next/server";
import { z } from "zod";
import { loadTranscript } from "@/core/db/chatTranscript";
import { failure, json } from "../../_lib/http";

/**
 * Returns one session's transcript.
 * @param request - the HTTP request.
 * @returns JSON `{ sessionId, turns }` or a friendly error.
 */
export async function GET(request: Request): Promise<Response> {
  await connection(); // per-request only; keep outside try/catch (D78)
  try {
    const sessionId = z.uuid().parse(new URL(request.url).searchParams.get("sessionId"));
    return json({ sessionId, turns: await loadTranscript(sessionId) });
  } catch (error) {
    return failure(error, "GET /api/chat/history");
  }
}
