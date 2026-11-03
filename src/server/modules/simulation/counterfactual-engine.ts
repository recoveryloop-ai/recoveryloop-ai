import { createHash } from "node:crypto";

import { assertMinorUnits } from "../../../shared/money";
import type { ObligationEngineOutput } from "../obligations/obligation-engine";

export const simulationOptions = ["ISSUE_POLICY_REFUND", "REQUEST_EVIDENCE", "DO_NOTHING"] as const;
export type SimulationOption = typeof simulationOptions[number];

export interface SimulationResult {
  inputHash: string;
  option: SimulationOption;
  decision: "ALLOWED" | "BLOCKED" | "NO_TRANSFER";
  reasonCodes: readonly string[];
  captureRemainingMinor: number;
  obligationOutstandingMinor: number;
  newRefundMinor: number;
  duplicateExposureMinor: number;
  recoveryCandidateMinor: number;
  safeguardResult: "PASS" | "BLOCK" | "NOT_APPLICABLE";
  uncertainties: readonly string[];
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function runCounterfactual(
  obligation: ObligationEngineOutput,
  option: SimulationOption,
): SimulationResult {
  assertMinorUnits(obligation.proposedRefundMinor);
  const transferRequested = option === "ISSUE_POLICY_REFUND";
  const newRefundMinor = transferRequested ? obligation.proposedRefundMinor : 0;
  const decision = transferRequested
    ? obligation.decision
    : "NO_TRANSFER";
  const uncertainties = [
    "Carrier recovery is conditional and excluded until verified incoming cash exists.",
    "Simulation does not call or mutate a payment provider.",
  ];
  const hashInput = {
    option,
    obligationKey: obligation.obligationKey,
    evidenceHash: obligation.evidenceHash,
    policyVersion: obligation.policyVersion,
    proposedRefundMinor: obligation.proposedRefundMinor,
    reasonCodes: obligation.reasonCodes,
  };

  return Object.freeze({
    inputHash: stableHash(hashInput),
    option,
    decision,
    reasonCodes: option === "REQUEST_EVIDENCE" ? ["EVIDENCE_REVIEW_REQUESTED"] : obligation.reasonCodes,
    captureRemainingMinor: Math.max(0, obligation.captureRemainingMinor - newRefundMinor),
    obligationOutstandingMinor: Math.max(0, obligation.outstandingMinor - newRefundMinor),
    newRefundMinor,
    duplicateExposureMinor: obligation.avoidedDuplicateExposureMinor,
    recoveryCandidateMinor: 0,
    safeguardResult: transferRequested
      ? (obligation.decision === "ALLOWED" ? "PASS" : "BLOCK")
      : "NOT_APPLICABLE",
    uncertainties: Object.freeze(uncertainties),
  });
}
