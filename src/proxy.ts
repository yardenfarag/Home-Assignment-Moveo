/**
 * First auth layer (Q16, A2): HTTP Basic Auth on every page and API route,
 * except /api/cron (it has its own secret) and static assets. API routes check
 * again themselves, because proxy alone is not a full authorization solution.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getAccessEnv } from "@/core/config/env";
import { userError } from "@/core/errors/userErrors";
import { isSiteAuthorized } from "@/core/security/auth";

const CHALLENGE = { "WWW-Authenticate": 'Basic realm="The Daily Prophet", charset="UTF-8"' };

/**
 * Lets signed-in requests through; asks the browser for credentials otherwise.
 * @param request - the incoming request.
 * @returns the next response, or a 401 (JSON for APIs, friendly text for pages).
 */
export function proxy(request: NextRequest): NextResponse {
  let access;
  try {
    access = getAccessEnv();
  } catch {
    return new NextResponse("The Daily Prophet isn't configured yet (site login missing).", { status: 500 });
  }
  if (isSiteAuthorized(request.headers.get("authorization"), access)) return NextResponse.next();

  const { status, ...body } = userError("unauthorized");
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: body }, { status, headers: CHALLENGE });
  }
  return new NextResponse(`${body.message} ${body.hint}`, {
    status,
    headers: { ...CHALLENGE, "Content-Type": "text/plain; charset=utf-8" },
  });
}

export const config = {
  matcher: ["/((?!api/cron|_next/static|_next/image|favicon.ico).*)"],
};
