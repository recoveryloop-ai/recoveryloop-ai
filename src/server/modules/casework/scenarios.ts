import { createHash } from "node:crypto";
import { createDatabase } from "../../db/client";
import { AppError } from "../../http/app-error";
import { loadInvestigationContext } from "../investigation/read-only-tools";
import { projectDemoScenario } from "../demo/demo-projection";
import type { CaseworkContext, CaseworkScenario, CaseworkOutput } from "./contracts";
export const scenarioFacts: Record<Exclude<CaseworkScenario, "BASELINE">, Record<string, string>> = {
  ALREADY_REFUNDED: { status: "COMPLETED", message: "Synthetic prior remedy satisfies the affected item obligation." },
  CONTRADICTORY_DELIVERY: { status: "CONFLICT", message: "Synthetic destination confirmation conflicts with the shipment record." },
  PENDING_REFUND: { status: "UNKNOWN", message: "Synthetic refund reservation has no confirmed final provider outcome." },
  DAMAGED_ITEM: { status: "DAMAGED_CLAIM", message: "Synthetic buyer reports damaged keyboard; photos and item condition are unverified." },
  NOT_RECEIVED: { status: "DELIVERED_DISPUTED", message: "Synthetic tracking says delivered; synthetic buyer says item not received. No accusation follows." },
  DISPUTE_INQUIRY: { status: "INQUIRY", message: "Synthetic dispute evidence request; deadline and actual PayPal dispute are not verified." },
  ENTITY_REVIEW: { status: "UNCONFIRMED_LEAD", message: "Fictional identity lead: two synthetic records share a name but have different identifiers. No real person or external source; no fraud finding." },
};
export function hashCasework(context: Omit<CaseworkContext, "evidenceHash"> | CaseworkContext): string {
  return createHash("sha256").update(JSON.stringify({ case: context.case, order: context.order, captures: context.captures, refunds: context.refunds, shipments: context.shipments, policy: context.policy, evidence: context.evidence, obligation: context.obligation, scenario: context.scenario })).digest("hex");
}
export async function loadCaseworkContext(databaseUrl: string, caseRef: string, scenario: CaseworkScenario = "BASELINE"): Promise<CaseworkContext> {
  if (caseRef !== "RG-2048" && scenario !== "BASELINE")
    throw new AppError("OVERLAY_CASE_SCOPE_VIOLATION", 403);
  const base = await loadInvestigationContext(databaseUrl, caseRef);
  const context: CaseworkContext = { ...base, scenario };
  if (scenario !== "BASELINE") {
    const { client } = createDatabase(databaseUrl);
    try {
      const [record] = await client<{
        id: string;
        facts: Record<string, unknown>;
        created_at: Date | string;
      }[]> `select id,facts,created_at from casework_evidence where case_id=${base.case.id} and scenario=${scenario}`;
      if (!record)
        throw new AppError("SCENARIO_EVIDENCE_NOT_READY", 503);
      context.evidence = [...base.evidence, { id: record.id, provider: "FIXTURE", sourceTier: "SYNTHETIC", observedAt: new Date(record.created_at).toISOString(), payloadHash: createHash("sha256").update(JSON.stringify(record.facts)).digest("hex"), facts: record.facts }];
    }
    finally {
      await client.end();
    }
    context.obligation = projectDemoScenario(base.obligation, scenario).after;
    if (["DAMAGED_ITEM", "NOT_RECEIVED"].includes(scenario)) {
      context.order = { ...base.order, items: base.order.items.map(item => item.fulfillmentStatus === "RETURNED_TO_SENDER" ? { ...item, fulfillmentStatus: "DELIVERED" } : item) };
      context.shipments = base.shipments.map(shipment => ({ ...shipment, status: "DELIVERED", sourceTier: "SYNTHETIC", synthetic: true, events: [] }));
    }
  }
  context.evidenceHash = hashCasework(context);
  return context;
}
export function allowedIssue(context: CaseworkContext): CaseworkOutput["issue"] {
  if (context.scenario === "DAMAGED_ITEM")
    return "ITEM_CONDITION_UNCONFIRMED";
  if (context.scenario === "NOT_RECEIVED" || context.scenario === "CONTRADICTORY_DELIVERY")
    return "DELIVERY_CONFLICT";
  if (context.scenario === "DISPUTE_INQUIRY")
    return "DISPUTE_EVIDENCE_REQUEST";
  if (context.scenario === "ENTITY_REVIEW")
    return "IDENTITY_UNCONFIRMED";
  if (context.obligation.reasonCodes.includes("REFUND_ALREADY_SETTLED"))
    return "REMEDY_COMPLETED";
  if (context.obligation.pendingReservationMinor > 0 || context.obligation.reasonCodes.includes("UNKNOWN_PAYMENT_OUTCOME"))
    return "PAYMENT_UNRESOLVED";
  return "RETURN_TO_SENDER";
}
