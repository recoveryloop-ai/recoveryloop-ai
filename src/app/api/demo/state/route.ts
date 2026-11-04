import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/server/http/route-error";
import { projectDemoScenario } from "@/server/modules/demo/demo-projection";
import { judgeCookieName, judgeSessionTtlSeconds, resolveJudgeSession } from "@/server/modules/demo/judge-session-service";
import { readCaseObligation } from "@/server/modules/obligations/obligation-graph-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await resolveJudgeSession(request);
    const base = await readCaseObligation(process.env.DATABASE_URL ?? "", "RG-2048");
    const response = NextResponse.json({
      session: { expiresAt: session.expiresAt },
      ...projectDemoScenario(base, session.scenario),
    }, { headers: { "Cache-Control": "private, no-store" } });
    if (session.cookieValue) response.cookies.set(judgeCookieName, session.cookieValue, {
      httpOnly: true,
      secure: request.headers.get("x-forwarded-proto") === "https" || new URL(request.url).protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: judgeSessionTtlSeconds,
    });
    return response;
  } catch (error) {
    return routeErrorResponse(error);
  }
}
