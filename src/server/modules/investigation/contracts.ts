import { z } from "zod";

export const findingTypes = [
  "DELIVERY_FAILURE",
  "PARTIAL_FULFILLMENT",
  "ITEM_RETURNED_TO_SENDER",
  "REFUND_ALREADY_SETTLED",
  "REFUND_RESERVED",
  "EVIDENCE_CONTRADICTION",
  "PAYMENT_RECONCILIATION_REQUIRED",
] as const;

export const investigationReasonCodes = [
  "ITEM_RETURNED_TO_SENDER",
  "PARTIAL_FULFILLMENT",
  "REFUND_ALREADY_SETTLED",
  "REFUND_RESERVED",
  "CAPTURE_NOT_COMPLETED",
  "UNKNOWN_PAYMENT_OUTCOME",
  "EVIDENCE_CONTRADICTS_ADDRESS",
  "INSUFFICIENT_EVIDENCE",
  "UNSUPPORTED_CITATION",
  "HYPOTHESIS_UNCONFIRMED",
] as const;

export const missingEvidenceTypes = [
  "carrier_reimbursement_terms",
  "carrier_proof_of_value",
  "confirmed_delivery_address_match",
  "final_payment_status",
] as const;

export const proposedActionTypes = [
  "REFUND_OBLIGATION",
  "REQUEST_EVIDENCE",
  "MONITOR_PAYMENT",
  "NO_ACTION",
] as const;

export const investigatorOutputSchema = z.object({
  case_id: z.uuid(),
  summary: z.string().min(1).max(1_000),
  findings: z.array(z.object({
    type: z.enum(findingTypes),
    evidence_ids: z.array(z.uuid()).min(1).max(8),
    certainty: z.enum(["supported", "hypothesis", "unknown"]),
  }).strict()).min(1).max(8),
  missing_evidence: z.array(z.enum(missingEvidenceTypes)).max(8),
  proposed_action_type: z.enum(proposedActionTypes),
  reason_codes: z.array(z.enum(investigationReasonCodes)).min(1).max(12),
  merchant_questions: z.array(z.string().min(1).max(300)).max(5),
  caveat: z.string().min(1).max(500),
}).strict();

export type InvestigatorOutput = z.infer<typeof investigatorOutputSchema>;

export type AiToolCall = {
  id: string;
  name: string;
  argumentsJson: string;
};

export type AiMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls: readonly AiToolCall[] }
  | { role: "tool"; content: string; toolCallId: string };

export type AiToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export interface AiTurnRequest {
  messages: readonly AiMessage[];
  tools: readonly AiToolDefinition[];
  jsonMode: boolean;
}

export interface AiTurnResponse {
  content: string | null;
  toolCalls: readonly AiToolCall[];
  responseId: string;
  promptTokens: number;
  completionTokens: number;
}

export interface InvestigatorProvider {
  readonly model: string;
  generate(request: AiTurnRequest): Promise<AiTurnResponse>;
}

export type InvestigationStatus = "VALIDATED" | "FALLBACK";

export interface InvestigationResult {
  investigationId: string;
  caseRef: string;
  status: InvestigationStatus;
  validationCode: string;
  source: "ZAI_VALIDATED" | "RULES_ONLY_FALLBACK";
  model: string;
  promptVersion: string;
  evidenceHash: string;
  output: InvestigatorOutput;
  deterministic: {
    decision: "ALLOWED" | "BLOCKED";
    reasonCodes: readonly string[];
    proposedRefundMinor: number;
    currency: "USD";
  };
  evidence: readonly {
    id: string;
    provider: string;
    sourceTier: string;
    observedAt: string;
    facts: Record<string, unknown>;
  }[];
}
