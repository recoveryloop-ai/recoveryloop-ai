import type { CarrierEvent, NormalizedCarrierStatus } from "../../adapters/logistics/carrier-provider";

export type CarrierRuleId = "R01" | "R02" | "R03" | "R04";
export type CarrierReasonCode =
  | "ITEM_RETURNED_TO_SENDER"
  | "PARTIAL_FULFILLMENT"
  | "EVIDENCE_CONTRADICTS_ADDRESS"
  | "CAPTURE_NOT_COMPLETED";

export type CarrierFinding = {
  ruleId: CarrierRuleId;
  reasonCode: CarrierReasonCode;
  caseKind: "DELIVERY_FAILURE" | "PARTIAL_FULFILLMENT" | "EVIDENCE_CONTRADICTION" | "PAYMENT_RECONCILIATION";
  severity: "LOW" | "MEDIUM" | "HIGH";
  sourceTier: "PROVIDER_TEST" | "SYNTHETIC";
  blocksFinancialAction: boolean;
};

export type CarrierRuleContext = {
  status: NormalizedCarrierStatus;
  paymentStatus: string | null;
  affectedItemCount: number;
  totalOrderItemCount: number;
  deliveredOrderItemCount: number;
  orderDestinationPostalCode?: string | null;
  eventDestinationPostalCode?: string | null;
  addressComparisonSynthetic?: boolean;
};

const exceptionStatuses = new Set<NormalizedCarrierStatus>(["RETURN_TO_SENDER", "FAILURE"]);

export function evaluateCarrierRules(context: CarrierRuleContext): readonly CarrierFinding[] {
  const findings: CarrierFinding[] = [];
  const hasCompletedCapture = context.paymentStatus === "COMPLETED";

  if (exceptionStatuses.has(context.status) && !hasCompletedCapture) {
    findings.push({
      ruleId: "R04",
      reasonCode: "CAPTURE_NOT_COMPLETED",
      caseKind: "PAYMENT_RECONCILIATION",
      severity: "HIGH",
      sourceTier: "PROVIDER_TEST",
      blocksFinancialAction: true,
    });
  }

  if (context.status === "RETURN_TO_SENDER" && hasCompletedCapture) {
    findings.push({
      ruleId: "R01",
      reasonCode: "ITEM_RETURNED_TO_SENDER",
      caseKind: "DELIVERY_FAILURE",
      severity: "HIGH",
      sourceTier: "PROVIDER_TEST",
      blocksFinancialAction: false,
    });
  }

  if (
    context.status === "RETURN_TO_SENDER" &&
    context.affectedItemCount > 0 &&
    context.affectedItemCount < context.totalOrderItemCount &&
    context.deliveredOrderItemCount > 0
  ) {
    findings.push({
      ruleId: "R02",
      reasonCode: "PARTIAL_FULFILLMENT",
      caseKind: "PARTIAL_FULFILLMENT",
      severity: "MEDIUM",
      sourceTier: "PROVIDER_TEST",
      blocksFinancialAction: false,
    });
  }

  if (
    context.status === "DELIVERED" &&
    context.orderDestinationPostalCode &&
    context.eventDestinationPostalCode &&
    context.orderDestinationPostalCode !== context.eventDestinationPostalCode
  ) {
    findings.push({
      ruleId: "R03",
      reasonCode: "EVIDENCE_CONTRADICTS_ADDRESS",
      caseKind: "EVIDENCE_CONTRADICTION",
      severity: "HIGH",
      sourceTier: context.addressComparisonSynthetic ? "SYNTHETIC" : "PROVIDER_TEST",
      blocksFinancialAction: true,
    });
  }

  return findings;
}

export function selectLatestCarrierEvent(events: readonly CarrierEvent[]): CarrierEvent | null {
  return [...events].sort((left, right) => {
    const timestampDifference = Date.parse(right.observedAt) - Date.parse(left.observedAt);
    return timestampDifference || right.providerEventId.localeCompare(left.providerEventId);
  })[0] ?? null;
}

export function selectPrimaryFinding(findings: readonly CarrierFinding[]): CarrierFinding | null {
  const priority: readonly CarrierRuleId[] = ["R04", "R01", "R03", "R02"];
  return priority.flatMap((ruleId) => findings.filter((finding) => finding.ruleId === ruleId))[0] ?? null;
}
