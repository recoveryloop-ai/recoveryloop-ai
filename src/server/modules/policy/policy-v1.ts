export const policyV1 = Object.freeze({
  version: "v1",
  currency: "USD",
  name: "RecoveryLoop Demo Returns Policy",
  effectiveAt: "2026-11-01T00:00:00.000Z",
  rules: Object.freeze({
    returnedToSender: Object.freeze({
      eligible: true,
      remedy: "refund_paid_item_total",
      reasonKey: "order-item:returned_to_sender",
    }),
    delivered: Object.freeze({
      eligible: false,
      remedy: "none",
      reasonKey: "order-item:delivered",
    }),
  }),
});

export type PolicySnapshot = typeof policyV1;

export function assertPolicySnapshot(snapshot: PolicySnapshot): void {
  if (snapshot.version !== "v1" || snapshot.currency !== "USD") {
    throw new Error("INVALID_POLICY_SNAPSHOT");
  }
  if (!snapshot.rules.returnedToSender.eligible) {
    throw new Error("RETURN_TO_SENDER_RULE_REQUIRED");
  }
}
