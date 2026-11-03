import { formatPayPalAmount, money } from "../../../shared/money";

export const activeReservationStates = ["APPROVED", "RESERVED", "EXECUTING", "PENDING", "UNKNOWN"] as const;
export type ActiveReservationState = typeof activeReservationStates[number];

export type RefundActionState = ActiveReservationState
  | "COMPLETED"
  | "FAILED"
  | "REJECTED"
  | "CANCELLED"
  | "BLOCKED"
  | "VERIFIED_CLOSED";

export interface ProposalSnapshot {
  readonly caseId: string;
  readonly caseRef: string;
  readonly orderId: string;
  readonly orderRef: string;
  readonly obligationId: string;
  readonly obligationKey: string;
  readonly captureId: string;
  readonly providerCaptureId: string;
  readonly amountMinor: number;
  readonly currency: "USD";
  readonly evidenceHash: string;
  readonly evidenceIds: readonly string[];
  readonly policyVersionId: string;
  readonly policyVersion: string;
  readonly captureVerifiedAt: string;
}

export function approvalPhrase(amountMinor: number): string {
  return `REFUND $${formatPayPalAmount(money(amountMinor))} IN SANDBOX`;
}

export function assertApprovalConfirmation(actual: string, amountMinor: number): void {
  if (actual !== approvalPhrase(amountMinor)) throw new Error("APPROVAL_CONFIRMATION_MISMATCH");
}

export function maskProviderIdentifier(value: string): string {
  if (value.length <= 8) return `${value.slice(0, 2)}…${value.slice(-2)}`;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function actionAllowsProviderPost(state: RefundActionState): boolean {
  return state === "RESERVED";
}

export function providerFailureState(retryable: boolean): "FAILED" | "UNKNOWN" {
  return retryable ? "UNKNOWN" : "FAILED";
}
