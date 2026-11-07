import { describe, expect, it } from "vitest";

import golden from "../fixtures/s4-golden.json";
import { deriveObligation, type ObligationEngineInput } from "../src/server/modules/obligations/obligation-engine";

type GoldenFixture = typeof golden.fixtures[number];

function inputFor(fixture: GoldenFixture): ObligationEngineInput {
  const input = fixture.input;
  if (input.fulfillment_status !== "DELIVERED" && input.fulfillment_status !== "RETURNED_TO_SENDER") {
    throw new Error("INVALID_GOLDEN_FULFILLMENT_STATUS");
  }
  return {
    fixtureId: fixture.id,
    orderId: `order-${fixture.id}`,
    itemId: `item-${fixture.id}`,
    obligationKey: `order-${fixture.id}:item-${fixture.id}:order-item:returned_to_sender`,
    policyVersion: golden.meta.policy_version,
    currency: golden.meta.currency,
    captureCurrency: golden.meta.currency,
    fulfillmentStatus: input.fulfillment_status,
    quantity: 1,
    unitMinor: input.unit_minor,
    taxMinor: 0,
    shippingMinor: 0,
    completedCaptureMinor: input.completed_capture_minor,
    completedAllocatedMinor: input.completed_allocated_minor,
    reservedAllocatedMinor: input.reserved_allocated_minor,
    requestedMinor: input.requested_minor,
    evidenceIds: input.evidence_ids,
    evidenceHash: `hash-${fixture.id}`,
    ...(fixture.id === "F04" || fixture.id === "F07" ? { unknownPaymentOutcome: true } : {}),
    ...(fixture.id === "F11" ? { evidenceContradiction: true } : {}),
  };
}

describe("deterministic obligation engine", () => {
  it.each(golden.fixtures)("matches the $id golden snapshot", (fixture) => {
    const result = deriveObligation(inputFor(fixture));
    expect({
      decision: result.decision,
      reason_codes: result.reasonCodes,
      entitled_minor: result.entitledMinor,
      realized_refund_minor: result.realizedRefundMinor,
      pending_reservation_minor: result.pendingReservationMinor,
      outstanding_minor: result.outstandingMinor,
      capture_remaining_minor: result.captureRemainingMinor,
      proposed_refund_minor: result.proposedRefundMinor,
    }).toEqual(fixture.expected);
    expect(result.formula).toEqual({
      lineTotal: golden.formulas.line_total,
      outstanding: golden.formulas.outstanding,
      captureRemaining: golden.formulas.capture_remaining,
      proposal: golden.formulas.proposal,
    });
    expect(result.evidenceIds).toEqual(fixture.input.evidence_ids);
    expect(result.conditionalRecoveryMinor).toBe(0);
  });

  it("preserves exact one-cent precision", () => {
    const base = inputFor(golden.fixtures[1]!);
    const result = deriveObligation({ ...base, unitMinor: 1, completedCaptureMinor: 1, requestedMinor: 1 });
    expect(result.entitledMinor).toBe(1);
    expect(result.proposedRefundMinor).toBe(1);
  });

  it("rejects mixed currencies", () => {
    const base = inputFor(golden.fixtures[1]!);
    expect(() => deriveObligation({ ...base, captureCurrency: "EUR" })).toThrow("MIXED_CURRENCY_FORBIDDEN");
  });

  it("derives only the returned partial item and keeps distinct obligations independent", () => {
    const base = inputFor(golden.fixtures[1]!);
    const delivered = deriveObligation({ ...base, itemId: "item-A", fulfillmentStatus: "DELIVERED", requestedMinor: 0 });
    const returnedB = deriveObligation({ ...base, itemId: "item-B", obligationKey: "order:item-B:rts" });
    const returnedC = deriveObligation({
      ...base,
      itemId: "item-C",
      obligationKey: "order:item-C:rts",
      unitMinor: 3_000,
      requestedMinor: 3_000,
    });
    expect(delivered.entitledMinor).toBe(0);
    expect(returnedB.proposedRefundMinor).toBe(10_000);
    expect(returnedC.proposedRefundMinor).toBe(3_000);
    expect(returnedB.obligationKey).not.toBe(returnedC.obligationKey);
  });

  it("blocks an approval made against a stale evidence hash", () => {
    const base = inputFor(golden.fixtures[1]!);
    const result = deriveObligation({ ...base, evidenceHash: "new", expectedEvidenceHash: "old" });
    expect(result.decision).toBe("BLOCKED");
    expect(result.reasonCodes).toContain("APPROVAL_STALE");
  });

  it("blocks a refund while a PayPal dispute is open and counts it as avoided double payout", () => {
    const base = inputFor(golden.fixtures[1]!);
    const result = deriveObligation({ ...base, disputeState: "OPEN" });
    expect(result.decision).toBe("BLOCKED");
    expect(result.reasonCodes).toEqual(["DISPUTE_OPEN"]);
    expect(result.proposedRefundMinor).toBe(0);
    expect(result.outstandingMinor).toBe(10_000);
    expect(result.avoidedDuplicateExposureMinor).toBe(10_000);
  });

  it("never refunds on top of a dispute that already paid the buyer", () => {
    const base = inputFor(golden.fixtures[1]!);
    const result = deriveObligation({ ...base, disputeState: "BUYER_PAID" });
    expect(result.decision).toBe("BLOCKED");
    expect(result.reasonCodes).toEqual(["DISPUTE_PAID_TO_BUYER"]);
    expect(result.proposedRefundMinor).toBe(0);
  });

  it("is unchanged when no dispute exists, and a dispute never unblocks another reason", () => {
    const base = inputFor(golden.fixtures[1]!);
    expect(deriveObligation({ ...base, disputeState: "NONE" })).toEqual(deriveObligation(base));
    const settled = inputFor(golden.fixtures.find((fixture) => fixture.id === "F03")!);
    const both = deriveObligation({ ...settled, disputeState: "OPEN" });
    expect(both.decision).toBe("BLOCKED");
    expect(both.reasonCodes).toEqual(expect.arrayContaining(["REFUND_ALREADY_SETTLED", "DISPUTE_OPEN"]));
    expect(both.proposedRefundMinor).toBe(0);
  });

  it("maintains non-negative, bounded outputs across deterministic small amounts", () => {
    const base = inputFor(golden.fixtures[1]!);
    for (let capture = 0; capture <= 100; capture += 7) {
      for (let unit = 1; unit <= 100; unit += 11) {
        const result = deriveObligation({ ...base, unitMinor: unit, requestedMinor: unit, completedCaptureMinor: capture });
        expect(result.proposedRefundMinor).toBeGreaterThanOrEqual(0);
        expect(result.proposedRefundMinor).toBeLessThanOrEqual(result.entitledMinor);
        expect(result.captureRemainingMinor).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
