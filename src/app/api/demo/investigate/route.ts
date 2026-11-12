import { NextResponse } from "next/server";

import { assertTrustedOrigin } from "@/server/http/request-security";
import { routeErrorResponse } from "@/server/http/route-error";
import { resolveJudgeSession } from "@/server/modules/demo/judge-session-service";
import { readCaseWorkspace } from "@/server/modules/casework/service";
import { readLatestInvestigation } from "@/server/modules/investigation/investigator-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertTrustedOrigin(request);
    const session = await resolveJudgeSession(request);
    if (session.scenario === "BASELINE") {
      const investigation = await readLatestInvestigation(process.env.DATABASE_URL ?? "", "RG-2048");
      return NextResponse.json({ mode: "CACHED_VALIDATED", aiCallMade: false, providerWrite: false, investigation }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    const workspace = await readCaseWorkspace(process.env.DATABASE_URL ?? "", "RG-2048", session.scenario);
    const fallback = { summary: workspace.workProduct.brief, proposedAction: workspace.run.output.outcome, reasonCodes: workspace.policy.reasons };
    return NextResponse.json({ mode: workspace.run.mode === "STORED_VALIDATED" ? "CACHED_VALIDATED" : "RULES_ONLY_FALLBACK", aiCallMade: false, providerWrite: false, fallback, casework: workspace.run }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
