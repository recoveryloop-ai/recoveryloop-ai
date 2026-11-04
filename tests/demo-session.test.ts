import { describe, expect, it } from "vitest";

import { projectDemoScenario } from "../src/server/modules/demo/demo-projection";
import { decodeJudgeCookie, encodeJudgeCookie, hashJudgeToken } from "../src/server/modules/demo/judge-session-service";
import type { ObligationEngineOutput } from "../src/server/modules/obligations/obligation-engine";

const secret = "s7-test-secret-that-is-at-least-thirty-two-characters";
const token = "A".repeat(43);
const base: ObligationEngineOutput = {
  fixtureId: "F02", obligationKey: "order:item:reason", policyVersion: "v1", currency: "USD",
  decision: "ALLOWED", reasonCodes: ["REFUND_ELIGIBLE"], entitledMinor: 10_000,
  realizedRefundMinor: 0, pendingReservationMinor: 0, conditionalRecoveryMinor: 0,
  outstandingMinor: 10_000, captureRemainingMinor: 25_000, proposedRefundMinor: 10_000,
  avoidedDuplicateExposureMinor: 0, evidenceIds: ["evidence-1"], evidenceHash: "a".repeat(64),
  formula: { lineTotal: "line", outstanding: "outstanding", captureRemaining: "capture", proposal: "proposal" },
};

describe("judge session security", () => {
  it("accepts an authentic cookie and rejects tampering", () => {
    const encoded = encodeJudgeCookie(token, secret);
    expect(decodeJudgeCookie(encoded, secret)).toBe(token);
    expect(decodeJudgeCookie(`${encoded}x`, secret)).toBeNull();
    expect(hashJudgeToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashJudgeToken(token)).not.toContain(token);
  });

  it("projects a duplicate refund without mutating the canonical input", () => {
    const projected = projectDemoScenario(base, "ALREADY_REFUNDED");
    expect(projected.after).toMatchObject({ decision: "BLOCKED", proposedRefundMinor: 0, outstandingMinor: 0, avoidedDuplicateExposureMinor: 10_000 });
    expect(projected.diff.reasonCodesAdded).toEqual(["REFUND_ALREADY_SETTLED"]);
    expect(projected.providerWrite).toBe(false);
    expect(base).toMatchObject({ decision: "ALLOWED", proposedRefundMinor: 10_000 });
  });

  it("blocks contradictory evidence and labels it synthetic", () => {
    const projected = projectDemoScenario(base, "CONTRADICTORY_DELIVERY");
    expect(projected.sourceTier).toBe("SYNTHETIC_SESSION_OVERLAY");
    expect(projected.after.reasonCodes).toEqual(["EVIDENCE_CONTRADICTS_ADDRESS"]);
    expect(projected.diff.proposedRefundMinor.delta).toBe(-10_000);
  });
});
