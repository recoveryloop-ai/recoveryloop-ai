import { createHash } from "node:crypto";

import type { ObligationEngineOutput, ObligationReasonCode } from "../obligations/obligation-engine";
import type { DemoScenario } from "./judge-session-service";

export type DemoProjection = {
  scenario: DemoScenario;
  sourceTier: "CANONICAL_LEDGER" | "SYNTHETIC_SESSION_OVERLAY";
  providerWrite: false;
  before: ObligationEngineOutput;
  after: ObligationEngineOutput;
  diff: {
    decision: { before: string; after: string };
    proposedRefundMinor: { before: number; after: number; delta: number };
    outstandingMinor: { before: number; after: number; delta: number };
    avoidedDuplicateExposureMinor: { before: number; after: number; delta: number };
    reasonCodesAdded: readonly ObligationReasonCode[];
  };
};

export function projectDemoScenario(base: ObligationEngineOutput, scenario: DemoScenario): DemoProjection {
  let after = base;
  if (scenario === "ALREADY_REFUNDED") {
    const realized = base.entitledMinor;
    after = Object.freeze({
      ...base,
      decision: "BLOCKED",
      reasonCodes: Object.freeze(["REFUND_ALREADY_SETTLED"] as const),
      realizedRefundMinor: realized,
      outstandingMinor: 0,
      captureRemainingMinor: Math.max(0, base.captureRemainingMinor - realized),
      proposedRefundMinor: 0,
      avoidedDuplicateExposureMinor: base.entitledMinor,
      evidenceHash: createHash("sha256").update(`${base.evidenceHash}:already-refunded`).digest("hex"),
    });
  } else if (scenario === "CONTRADICTORY_DELIVERY") {
    after = Object.freeze({
      ...base,
      decision: "BLOCKED",
      reasonCodes: Object.freeze(["EVIDENCE_CONTRADICTS_ADDRESS"] as const),
      proposedRefundMinor: 0,
      evidenceHash: createHash("sha256").update(`${base.evidenceHash}:contradictory-delivery`).digest("hex"),
    });
  }
  const added = after.reasonCodes.filter((code) => !base.reasonCodes.includes(code));
  return {
    scenario,
    sourceTier: scenario === "BASELINE" ? "CANONICAL_LEDGER" : "SYNTHETIC_SESSION_OVERLAY",
    providerWrite: false,
    before: base,
    after,
    diff: {
      decision: { before: base.decision, after: after.decision },
      proposedRefundMinor: { before: base.proposedRefundMinor, after: after.proposedRefundMinor, delta: after.proposedRefundMinor - base.proposedRefundMinor },
      outstandingMinor: { before: base.outstandingMinor, after: after.outstandingMinor, delta: after.outstandingMinor - base.outstandingMinor },
      avoidedDuplicateExposureMinor: { before: base.avoidedDuplicateExposureMinor, after: after.avoidedDuplicateExposureMinor, delta: after.avoidedDuplicateExposureMinor - base.avoidedDuplicateExposureMinor },
      reasonCodesAdded: added,
    },
  };
}
