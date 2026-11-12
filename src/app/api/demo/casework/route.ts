import { NextResponse } from "next/server";
import { z } from "zod";
import { routeErrorResponse } from "@/server/http/route-error";
import { readCaseWorkspace } from "@/server/modules/casework/service";
import { judgeCookieName, judgeSessionTtlSeconds, resolveJudgeSession } from "@/server/modules/demo/judge-session-service";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const caseRef = z.string().regex(/^RG-\d{4,10}$/).parse(new URL(request.url).searchParams.get("case") ?? "RG-2048");
    const session = await resolveJudgeSession(request);
    const projection = await readCaseWorkspace(process.env.DATABASE_URL ?? "", caseRef, caseRef === "RG-2048" ? session.scenario : "BASELINE");
    const response = NextResponse.json(projection, { headers: { "Cache-Control": "private, no-store" } });
    if (session.cookieValue)
      response.cookies.set(judgeCookieName, session.cookieValue, { httpOnly: true, secure: new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https", sameSite: "lax", path: "/", maxAge: judgeSessionTtlSeconds });
    return response;
  }
  catch (error) {
    return routeErrorResponse(error);
  }
}
