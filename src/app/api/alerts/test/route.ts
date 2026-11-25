/**
 * POST /api/alerts/test — records one clearly marked TEST alert (D124), for demos.
 * Needs `Authorization: Bearer <CRON_SECRET>`, so random visitors can't create alerts.
 */
import { sendTestAlert } from "@/core/alerts/sendTestAlert";
import { failure, json, requireCronAuth } from "../../_lib/http";

/**
 * Records the test alert.
 * @param request - the HTTP request.
 * @returns `{ ok: true, message }` or a friendly error.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const denied = requireCronAuth(request);
    if (denied) return denied;
    return json({ ok: true, message: await sendTestAlert() });
  } catch (error) {
    return failure(error, "POST /api/alerts/test");
  }
}
