/**
 * GET /api/widgets — data for the dashboard widgets (A5): top hubs, hazard
 * leaders, data freshness. Deterministic, no LLM.
 */
import { connection } from "next/server";
import { loadWidgetsData } from "@/core/widgets/loadWidgetsData";
import { failure, json } from "../_lib/http";

/**
 * Returns the widget data.
 * @returns JSON widget data or a friendly error.
 */
export async function GET(): Promise<Response> {
  await connection(); // always per-request: never prerender (Cache Components), and keep it outside the try/catch
  try {
    return json(await loadWidgetsData());
  } catch (error) {
    return failure(error, "GET /api/widgets");
  }
}
