import { describe, expect, it } from "vitest";

import { AppError } from "../src/server/http/app-error";
import {
  actionAllowsProviderPost,
  approvalPhrase,
  assertApprovalConfirmation,
  maskProviderIdentifier,
  providerFailureState,
} from "../src/server/modules/refunds/contracts";
import { assertProviderRefundBinding } from "../src/server/modules/refunds/refund-action-service";

const verifiedRefund = {
  providerRefundId: "REFUND-123",
  providerCaptureId: "CAPTURE-123",
  amountMinor: 10_000,
  currency: "USD" as const,
  status: "COMPLETED" as const,
  sourceTier: "PROVIDER_VERIFIED" as const,
  synthetic: false,
  verifiedAt: "2026-11-03T18:00:00.000Z",
};

describe("S6 approval contract", () => {
  it("requires the exact deterministic amount in the sandbox confirmation phrase", () => {
    expect(approvalPhrase(10_000)).toBe("REFUND $100.00 IN SANDBOX");
    expect(() => assertApprovalConfirmation("REFUND $100.00 IN SANDBOX", 10_000)).not.toThrow();
    expect(() => assertApprovalConfirmation("REFUND $101.00 IN SANDBOX", 10_000)).toThrow("APPROVAL_CONFIRMATION_MISMATCH");
  });

  it("accepts only an exact provider-verified read-back", () => {
    expect(() => assertProviderRefundBinding(verifiedRefund, "REFUND-123", 10_000)).not.toThrow();
    for (const invalid of [
      { ...verifiedRefund, providerRefundId: "REFUND-FABRICATED" },
      { ...verifiedRefund, amountMinor: 9_999 },
      { ...verifiedRefund, synthetic: true, sourceTier: "SYNTHETIC" as const },
    ]) {
      try {
        assertProviderRefundBinding(invalid, "REFUND-123", 10_000);
        throw new Error("EXPECTED_BINDING_FAILURE");
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect(error).toMatchObject({ code: "REFUND_READ_BACK_MISMATCH" });
      }
    }
  });

  it("redacts provider identifiers in public certificate projections", () => {
    expect(maskProviderIdentifier("1JU08902781691411")).toBe("1JU0…1411");
  });

  it("permits one provider POST only from RESERVED and fails uncertain errors closed", () => {
    expect(actionAllowsProviderPost("RESERVED")).toBe(true);
    for (const state of ["EXECUTING", "PENDING", "UNKNOWN", "VERIFIED_CLOSED"] as const) {
      expect(actionAllowsProviderPost(state)).toBe(false);
    }
    expect(providerFailureState(true)).toBe("UNKNOWN");
    expect(providerFailureState(false)).toBe("FAILED");
  });
});
