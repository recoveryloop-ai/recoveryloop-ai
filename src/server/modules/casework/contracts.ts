import { z } from "zod";
import type { InvestigationContext } from "../investigation/read-only-tools";
export type ToolLogEntry = {
  toolName: string;
  argumentsHash: string;
  responseHash: string;
  initiatedBy: "MODEL" | "ORCHESTRATOR";
};
export const caseworkScenarios = ["BASELINE", "ALREADY_REFUNDED", "CONTRADICTORY_DELIVERY", "PENDING_REFUND", "DAMAGED_ITEM", "NOT_RECEIVED", "DISPUTE_INQUIRY", "ENTITY_REVIEW"] as const;
export type CaseworkScenario = typeof caseworkScenarios[number];
export const outcomes = ["REQUEST_EVIDENCE", "ROUTE_TO_OPERATOR", "MONITOR_PAYMENT", "NO_ACTION", "READY_FOR_POLICY_REVIEW"] as const;
export const issues = ["RETURN_TO_SENDER", "REMEDY_COMPLETED", "PAYMENT_UNRESOLVED", "DELIVERY_CONFLICT", "ITEM_CONDITION_UNCONFIRMED", "DISPUTE_EVIDENCE_REQUEST", "IDENTITY_UNCONFIRMED"] as const;
export const missingProof = ["item_photos", "item_condition", "delivery_confirmation", "buyer_receipt_account", "final_payment_status", "carrier_terms", "dispute_deadline", "independent_identity_check"] as const;
export const caseworkOutputSchema = z.object({
  case_id: z.uuid(), evidence_hash: z.string().regex(/^[a-f0-9]{64}$/),
  issue: z.enum(issues), outcome: z.enum(outcomes), confidence: z.enum(["supported", "uncertain"]),
  findings: z.array(z.object({ evidence_ids: z.array(z.uuid()).min(1).max(8), certainty: z.enum(["supported", "unknown", "conflicting"]) }).strict()).min(1).max(6),
  missing_evidence: z.array(z.enum(missingProof)).max(8),
}).strict();
export type CaseworkOutput = z.infer<typeof caseworkOutputSchema>;
export interface CaseworkContext extends InvestigationContext {
  scenario: CaseworkScenario;
}
export interface CaseworkRun {
  id: string | null;
  mode: "STORED_VALIDATED" | "FRESH_VALIDATED" | "RULES_ONLY";
  model: string | null;
  promptVersion: string;
  validationCode: string;
  createdAt: string | null;
  evidenceHash: string;
  output: CaseworkOutput;
  toolLog: readonly ToolLogEntry[];
}
export interface WorkProduct {
  brief: string;
  checklist: readonly string[];
  draftRequest: string;
  evidenceBundle: readonly {
    id: string;
    source: string;
    observedAt: string;
  }[];
  status: "DRAFT_NOT_SENT";
  caveat: string;
}
export interface CaseWorkspace {
  caseRef: string;
  scenario: CaseworkScenario;
  source: "CANONICAL_LEDGER" | "SYNTHETIC_SESSION_OVERLAY";
  providerWrite: false;
  aiCallMade: false;
  item: {
    name: string;
    sku: string;
    state: string;
    source: string;
  };
  buyerClaim: string;
  orderRef: string;
  money: {
    capturedMinor: number;
    completedRefundMinor: number;
    pendingReservationMinor: number;
    obligationMinor: number;
    proposedRemedyMinor: number;
    hypotheticalRecoveryMinor: number;
    currency: "USD";
    source: string;
  };
  policy: {
    version: string;
    decision: string;
    reasons: readonly string[];
  };
  timeline: readonly {
    id: string;
    label: string;
    source: string;
    observedAt: string;
  }[];
  evidence: readonly {
    id: string;
    provider: string;
    sourceTier: string;
    observedAt: string;
    facts: Record<string, unknown>;
  }[];
  run: CaseworkRun;
  workProduct: WorkProduct;
  certificate: {
    caseRef: "RG-2052";
    href: string;
    label: string;
  };
}
