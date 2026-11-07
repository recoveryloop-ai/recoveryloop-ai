import { addMoney, assertMinorUnits, money, multiplyMoney, USD, type Currency } from "../../../shared/money";
import type { OrderDisputeState } from "../disputes/contracts";

export const obligationReasonCodes = [
  "REFUND_ELIGIBLE",
  "NO_REFUND_OBLIGATION",
  "REFUND_ALREADY_SETTLED",
  "REFUND_RESERVED",
  "CAPTURE_NOT_COMPLETED",
  "UNKNOWN_PAYMENT_OUTCOME",
  "EVIDENCE_CONTRADICTS_ADDRESS",
  "APPROVAL_STALE",
  "EXCEEDS_CAPTURE_BALANCE",
  "EXCEEDS_OBLIGATION_BALANCE",
  "DISPUTE_OPEN",
  "DISPUTE_PAID_TO_BUYER",
] as const;

export type ObligationReasonCode = typeof obligationReasonCodes[number];
export type ObligationDecision = "ALLOWED" | "BLOCKED";

export interface ObligationEngineInput {
  fixtureId: string;
  orderId: string;
  itemId: string;
  obligationKey: string;
  policyVersion: string;
  currency: string;
  captureCurrency: string;
  fulfillmentStatus: "DELIVERED" | "RETURNED_TO_SENDER";
  quantity: number;
  unitMinor: number;
  taxMinor: number;
  shippingMinor: number;
  completedCaptureMinor: number;
  completedAllocatedMinor: number;
  reservedAllocatedMinor: number;
  unallocatedCompletedRefundMinor?: number;
  unallocatedPendingRefundMinor?: number;
  requestedMinor?: number;
  evidenceIds: readonly string[];
  evidenceHash: string;
  expectedEvidenceHash?: string;
  evidenceContradiction?: boolean;
  unknownPaymentOutcome?: boolean;
  /**
   * PayPal dispute state for the order's captures. A dispute is a second money path:
   * while one is open, or after it paid the buyer, a refund would pay the customer twice.
   * Omitted means NONE (no dispute observed).
   */
  disputeState?: OrderDisputeState;
}

export interface ObligationFormula {
  lineTotal: string;
  outstanding: string;
  captureRemaining: string;
  proposal: string;
}

export interface ObligationEngineOutput {
  fixtureId: string;
  obligationKey: string;
  policyVersion: string;
  currency: Currency;
  decision: ObligationDecision;
  reasonCodes: readonly ObligationReasonCode[];
  entitledMinor: number;
  realizedRefundMinor: number;
  pendingReservationMinor: number;
  conditionalRecoveryMinor: number;
  outstandingMinor: number;
  captureRemainingMinor: number;
  proposedRefundMinor: number;
  avoidedDuplicateExposureMinor: number;
  evidenceIds: readonly string[];
  evidenceHash: string;
  formula: ObligationFormula;
}

function assertCurrency(currency: string): asserts currency is Currency {
  if (currency !== USD) throw new Error("MIXED_CURRENCY_FORBIDDEN");
}

function sumMinor(...values: readonly number[]): number {
  return addMoney(...values.map((value) => money(value))).minor;
}

export function deriveObligation(input: ObligationEngineInput): ObligationEngineOutput {
  assertCurrency(input.currency);
  assertCurrency(input.captureCurrency);
  if (input.currency !== input.captureCurrency) throw new Error("MIXED_CURRENCY_FORBIDDEN");
  if (input.policyVersion !== "v1") throw new Error("UNSUPPORTED_POLICY_VERSION");
  if (input.evidenceIds.length === 0) throw new Error("EVIDENCE_REQUIRED");

  const merchandiseMinor = multiplyMoney(money(input.unitMinor), input.quantity).minor;
  const lineTotalMinor = sumMinor(merchandiseMinor, input.taxMinor, input.shippingMinor);
  const completedAllocatedMinor = assertMinorUnits(input.completedAllocatedMinor, "completed allocation");
  const reservedAllocatedMinor = assertMinorUnits(input.reservedAllocatedMinor, "reserved allocation");
  const unallocatedCompletedRefundMinor = assertMinorUnits(
    input.unallocatedCompletedRefundMinor ?? 0,
    "unallocated completed refunds",
  );
  const unallocatedPendingRefundMinor = assertMinorUnits(
    input.unallocatedPendingRefundMinor ?? 0,
    "unallocated pending refunds",
  );
  const completedCaptureMinor = assertMinorUnits(input.completedCaptureMinor, "completed capture");
  const entitledMinor = input.fulfillmentStatus === "RETURNED_TO_SENDER" ? lineTotalMinor : 0;
  const outstandingMinor = Math.max(0, entitledMinor - completedAllocatedMinor);
  const captureRemainingMinor = Math.max(
    0,
    completedCaptureMinor - completedAllocatedMinor - reservedAllocatedMinor
      - unallocatedCompletedRefundMinor - unallocatedPendingRefundMinor,
  );
  const requestedMinor = assertMinorUnits(input.requestedMinor ?? outstandingMinor, "requested refund");
  const reasons: ObligationReasonCode[] = [];

  if (entitledMinor === 0) reasons.push("NO_REFUND_OBLIGATION");
  if (completedCaptureMinor === 0) reasons.push("CAPTURE_NOT_COMPLETED");
  if (completedAllocatedMinor >= entitledMinor && entitledMinor > 0) reasons.push("REFUND_ALREADY_SETTLED");
  if (reservedAllocatedMinor >= outstandingMinor && outstandingMinor > 0) reasons.push("REFUND_RESERVED");
  if (input.unknownPaymentOutcome) reasons.push("UNKNOWN_PAYMENT_OUTCOME");
  if (input.evidenceContradiction) reasons.push("EVIDENCE_CONTRADICTS_ADDRESS");
  const disputeState = input.disputeState ?? "NONE";
  if (disputeState === "OPEN") reasons.push("DISPUTE_OPEN");
  if (disputeState === "BUYER_PAID") reasons.push("DISPUTE_PAID_TO_BUYER");
  if (input.expectedEvidenceHash !== undefined && input.expectedEvidenceHash !== input.evidenceHash) {
    reasons.push("APPROVAL_STALE");
  }
  const hasTerminalBalanceBlock = reasons.some((reason) => (
    reason === "NO_REFUND_OBLIGATION" || reason === "CAPTURE_NOT_COMPLETED"
      || reason === "REFUND_ALREADY_SETTLED" || reason === "REFUND_RESERVED"
      || reason === "DISPUTE_OPEN" || reason === "DISPUTE_PAID_TO_BUYER"
  ));
  if (!hasTerminalBalanceBlock && requestedMinor > captureRemainingMinor) reasons.push("EXCEEDS_CAPTURE_BALANCE");
  if (!hasTerminalBalanceBlock && requestedMinor > outstandingMinor) reasons.push("EXCEEDS_OBLIGATION_BALANCE");

  const decision = reasons.length === 0 ? "ALLOWED" : "BLOCKED";
  if (decision === "ALLOWED") reasons.push("REFUND_ELIGIBLE");
  const proposedRefundMinor = decision === "ALLOWED" ? requestedMinor : 0;
  const duplicateBlocked = reasons.includes("REFUND_ALREADY_SETTLED") || reasons.includes("REFUND_RESERVED")
    || reasons.includes("DISPUTE_OPEN") || reasons.includes("DISPUTE_PAID_TO_BUYER");

  return Object.freeze({
    fixtureId: input.fixtureId,
    obligationKey: input.obligationKey,
    policyVersion: input.policyVersion,
    currency: USD,
    decision,
    reasonCodes: Object.freeze(reasons),
    entitledMinor,
    realizedRefundMinor: completedAllocatedMinor,
    pendingReservationMinor: reservedAllocatedMinor,
    conditionalRecoveryMinor: 0,
    outstandingMinor,
    captureRemainingMinor,
    proposedRefundMinor,
    avoidedDuplicateExposureMinor: duplicateBlocked ? requestedMinor : 0,
    evidenceIds: Object.freeze([...input.evidenceIds]),
    evidenceHash: input.evidenceHash,
    formula: Object.freeze({
      lineTotal: "(unit_minor * quantity) + tax_minor + shipping_minor",
      outstanding: "max(0, entitled_minor - completed_allocated_minor)",
      captureRemaining: "max(0, completed_capture_minor - completed_allocated_minor - reserved_allocated_minor - other_refunds_minor)",
      proposal: "allowed ? requested_minor : 0",
    }),
  });
}
