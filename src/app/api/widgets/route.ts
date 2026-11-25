/**
 * GET /api/widgets — data for the dashboard widgets (A5): top hubs, hazard
 * leaders, data freshness. Deterministic, no LLM.
 */
import { connection } from "next/server";
import { loadWidgetsData } from "@/core/widgets/loadWidgetsData";
import { failure, json, requireSiteAuth } from "../_lib/http";

/**
 * Returns the widget data.
 * @param request - the HTTP request.
 * @returns JSON widget data or a friendly error.
 */
export async function GET(request: Request): Promise<Response> {
  await connection(); // always per-request: never prerender (Cache Components), and keep it outside the try/catch
  try {
    const denied = requireSiteAuth(request);
    if (denied) return denied;
    return json(await loadWidgetsData());
  } catch (error) {
    return failure(error, "GET /api/widgets");
  }
}
