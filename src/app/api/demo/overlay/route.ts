import { NextResponse } from "next/server";
import { z } from "zod";

import { assertTrustedOrigin } from "@/server/http/request-security";
import { routeErrorResponse } from "@/server/http/route-error";
import { judgeCookieName, judgeSessionTtlSeconds, mutableDemoScenarios, resolveJudgeSession, setDemoOverlay } from "@/server/modules/demo/judge-session-service";

export const dynamic = "force-dynamic";
const bodySchema = z.object({ scenario: z.enum(mutableDemoScenarios) }).strict();

export async function POST(request: Request) {
  try {
    assertTrustedOrigin(request);
    const session = await resolveJudgeSession(request);
    const { scenario } = bodySchema.parse(await request.json());
    await setDemoOverlay(session.id, scenario);
    const response = NextResponse.json({ scenario, sourceTier: "SYNTHETIC_SESSION_OVERLAY", providerWrite: false }, {
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
