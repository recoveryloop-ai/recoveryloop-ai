import { describe, expect, it } from "vitest";

import type { CarrierEvent } from "../src/server/adapters/logistics/carrier-provider";
import { evaluateCarrierRules, selectLatestCarrierEvent, selectPrimaryFinding } from "../src/server/modules/logistics/carrier-rules";

function carrierEvent(providerEventId: string, status: CarrierEvent["status"], observedAt: string): CarrierEvent {
  return {
    providerEventId,
    status,
    statusDetail: null,
    message: null,
    location: { city: null, state: null, country: null, postalCode: null },
    observedAt,
    sourceTier: "PROVIDER_TEST",
    synthetic: false,
    rawPayloadHash: providerEventId.padEnd(64, "0").slice(0, 64),
    rawPayload: { status },
  };
}

describe("carrier detection rules R01-R04", () => {
  it("opens delivery-failure and partial-fulfillment findings for paid F02", () => {
    const findings = evaluateCarrierRules({
      status: "RETURN_TO_SENDER",
      paymentStatus: "COMPLETED",
      affectedItemCount: 1,
      totalOrderItemCount: 2,
      deliveredOrderItemCount: 1,
    });
    expect(findings.map((finding) => finding.ruleId)).toEqual(["R01", "R02"]);
    expect(selectPrimaryFinding(findings)?.caseKind).toBe("DELIVERY_FAILURE");
  });

  it("holds financial action when the capture is absent or incomplete", () => {
    const findings = evaluateCarrierRules({
      status: "FAILURE",
      paymentStatus: "PENDING",
      affectedItemCount: 1,
      totalOrderItemCount: 1,
      deliveredOrderItemCount: 0,
    });
    expect(findings).toEqual([expect.objectContaining({ ruleId: "R04", blocksFinancialAction: true })]);
  });

  it("flags a delivered-address contradiction without asserting wrong delivery", () => {
    const findings = evaluateCarrierRules({
      status: "DELIVERED",
      paymentStatus: "COMPLETED",
      affectedItemCount: 1,
      totalOrderItemCount: 1,
      deliveredOrderItemCount: 1,
      orderDestinationPostalCode: "10001",
      eventDestinationPostalCode: "10011",
      addressComparisonSynthetic: true,
    });
    expect(findings).toEqual([expect.objectContaining({
      ruleId: "R03",
      reasonCode: "EVIDENCE_CONTRADICTS_ADDRESS",
      sourceTier: "SYNTHETIC",
      blocksFinancialAction: true,
    })]);
  });

  it("does not let an older out-of-order event regress current state", () => {
    const latest = selectLatestCarrierEvent([
      carrierEvent("event-new", "RETURN_TO_SENDER", "2026-11-03T12:00:00.000Z"),
      carrierEvent("event-old", "IN_TRANSIT", "2026-11-01T12:00:00.000Z"),
    ]);
    expect(latest?.providerEventId).toBe("event-new");
    expect(latest?.status).toBe("RETURN_TO_SENDER");
  });
});
