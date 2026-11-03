import { describe, expect, it } from "vitest";

import { deriveObligation } from "../src/server/modules/obligations/obligation-engine";
import { runCounterfactual } from "../src/server/modules/simulation/counterfactual-engine";

const eligible = deriveObligation({
  fixtureId: "F02",
  orderId: "order-f02",
  itemId: "item-b",
  obligationKey: "order-f02:item-b:rts",
  policyVersion: "v1",
  currency: "USD",
  captureCurrency: "USD",
  fulfillmentStatus: "RETURNED_TO_SENDER",
  quantity: 1,
  unitMinor: 10_000,
  taxMinor: 0,
  shippingMinor: 0,
  completedCaptureMinor: 25_000,
  completedAllocatedMinor: 0,
  reservedAllocatedMinor: 0,
  requestedMinor: 10_000,
  evidenceIds: ["ev-f02"],
  evidenceHash: "f02-evidence-hash",
});

describe("counterfactual simulation", () => {
  it("simulates a policy refund without mutating the source state", () => {
    const before = structuredClone(eligible);
    const result = runCounterfactual(eligible, "ISSUE_POLICY_REFUND");
    expect(result).toMatchObject({
      decision: "ALLOWED",
      newRefundMinor: 10_000,
      captureRemainingMinor: 15_000,
      obligationOutstandingMinor: 0,
      safeguardResult: "PASS",
      recoveryCandidateMinor: 0,
    });
    expect(result.inputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(eligible).toEqual(before);
  });

  it("never transfers for evidence review or do-nothing options", () => {
    expect(runCounterfactual(eligible, "REQUEST_EVIDENCE")).toMatchObject({
      decision: "NO_TRANSFER",
      newRefundMinor: 0,
      safeguardResult: "NOT_APPLICABLE",
    });
    expect(runCounterfactual(eligible, "DO_NOTHING")).toMatchObject({
      decision: "NO_TRANSFER",
      newRefundMinor: 0,
      safeguardResult: "NOT_APPLICABLE",
    });
  });
});
