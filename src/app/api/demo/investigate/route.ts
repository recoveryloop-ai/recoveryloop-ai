import { NextResponse } from "next/server";

import { assertTrustedOrigin } from "@/server/http/request-security";
import { routeErrorResponse } from "@/server/http/route-error";
import { resolveJudgeSession, type DemoScenario } from "@/server/modules/demo/judge-session-service";
import { readLatestInvestigation } from "@/server/modules/investigation/investigator-service";

export const dynamic = "force-dynamic";

type RulesFallback = { summary: string; proposedAction: "NO_ACTION" | "REQUEST_EVIDENCE" | "RESPOND_TO_DISPUTE"; reasonCodes: readonly string[] };

const rulesFallbacks: Record<Exclude<DemoScenario, "BASELINE">, RulesFallback> = {
  ALREADY_REFUNDED: { summary: "The synthetic overlay marks the obligation as already settled.", proposedAction: "NO_ACTION", reasonCodes: ["REFUND_ALREADY_SETTLED"] },
  CONTRADICTORY_DELIVERY: { summary: "The synthetic overlay introduces contradictory delivery evidence.", proposedAction: "REQUEST_EVIDENCE", reasonCodes: ["EVIDENCE_CONTRADICTS_ADDRESS"] },
  BUYER_DISPUTE: { summary: "The synthetic overlay opens a PayPal dispute on the capture. Refunds are blocked; the obligation is settled through the dispute so the buyer is never paid twice.", proposedAction: "RESPOND_TO_DISPUTE", reasonCodes: ["DISPUTE_OPEN"] },
};

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
    const fallback = rulesFallbacks[session.scenario];
    return NextResponse.json({ mode: "RULES_ONLY_FALLBACK", aiCallMade: false, providerWrite: false, fallback }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
