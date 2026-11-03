import { deriveObligation } from "../../src/server/modules/obligations/obligation-engine";
import type { InvestigationContext } from "../../src/server/modules/investigation/read-only-tools";

export const investigationIds = {
  case: "60000000-0000-4000-8000-000000000002",
  order: "20000000-0000-4000-8000-000000000002",
  item: "30000000-0000-4000-8000-000000000003",
  capture: "40000000-0000-4000-8000-000000000002",
  evidenceA: "80000000-0000-4000-8000-000000000002",
  evidenceB: "80000000-0000-4000-8000-000000000012",
} as const;

export function createInvestigationContext(): InvestigationContext {
  const obligation = deriveObligation({
    fixtureId: "F02",
    orderId: investigationIds.order,
    itemId: investigationIds.item,
    obligationKey: "f02:item-b:rts",
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
    evidenceIds: [investigationIds.evidenceA, investigationIds.evidenceB],
    evidenceHash: "a".repeat(64),
  });
  return {
    case: {
      id: investigationIds.case,
      externalRef: "RG-2048",
      kind: "DELIVERY_FAILURE",
      status: "OPEN",
      severity: "MEDIUM",
      sourceTier: "PROVIDER_TEST",
    },
    order: {
      id: investigationIds.order,
      externalRef: "RG-2048",
      status: "PARTIALLY_RETURNED",
      currency: "USD",
      totalMinor: 25_000,
      policyVersion: "v1",
      items: [{
        id: investigationIds.item,
        sku: "B",
        name: "Orbit Mechanical Keyboard",
        quantity: 1,
        unitMinor: 10_000,
        taxMinor: 0,
        shippingMinor: 0,
        fulfillmentStatus: "RETURNED_TO_SENDER",
      }],
    },
    captures: [{
      id: investigationIds.capture,
      provider: "FIXTURE",
      status: "COMPLETED",
      capturedMinor: 25_000,
      currency: "USD",
      verifiedAt: "2026-11-01T00:00:00.000Z",
    }],
    refunds: [],
    shipments: [],
    policy: { version: "v1", rules: { returnedToSender: { eligible: true } } },
    evidence: [
      {
        id: investigationIds.evidenceA,
        provider: "EASYPOST",
        sourceTier: "PROVIDER_TEST",
        observedAt: "2026-11-01T00:00:00.000Z",
        payloadHash: "1".repeat(64),
        facts: { status: "RETURN_TO_SENDER" },
      },
      {
        id: investigationIds.evidenceB,
        provider: "POLICY_SNAPSHOT",
        sourceTier: "MERCHANT_ATTESTED",
        observedAt: "2026-11-01T00:00:00.000Z",
        payloadHash: "2".repeat(64),
        facts: { version: "v1" },
      },
    ],
    evidenceHash: "a".repeat(64),
    obligation,
  };
}
