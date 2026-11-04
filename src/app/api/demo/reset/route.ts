import { NextResponse } from "next/server";

import { assertTrustedOrigin } from "@/server/http/request-security";
import { routeErrorResponse } from "@/server/http/route-error";
import { judgeCookieName, judgeSessionTtlSeconds, resetDemoOverlay, resolveJudgeSession } from "@/server/modules/demo/judge-session-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertTrustedOrigin(request);
    const session = await resolveJudgeSession(request);
    const removed = await resetDemoOverlay(session.id);
    const response = NextResponse.json({ scenario: "BASELINE", removed, canonicalLedgerMutated: false, providerWrite: false }, {
      headers: { "Cache-Control": "private, no-store" },
    });
    if (session.cookieValue) response.cookies.set(judgeCookieName, session.cookieValue, {
      httpOnly: true, secure: request.headers.get("x-forwarded-proto") === "https" || new URL(request.url).protocol === "https:", sameSite: "lax", path: "/", maxAge: judgeSessionTtlSeconds,
    });
    return response;
  } catch (error) {
    return routeErrorResponse(error);
  }
}
