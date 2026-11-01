import { describe, expect, it } from "vitest";

import { assertPolicySnapshot, policyV1 } from "../src/server/modules/policy/policy-v1.js";

describe("policy v1 snapshot", () => {
  it("keeps the approved policy identity and deterministic rules", () => {
    assertPolicySnapshot(policyV1);
    expect(policyV1).toMatchInlineSnapshot(`
      {
        "currency": "USD",
        "effectiveAt": "2026-11-01T00:00:00.000Z",
        "name": "RecoveryLoop Demo Returns Policy",
        "rules": {
          "delivered": {
            "eligible": false,
            "reasonKey": "order-item:delivered",
            "remedy": "none",
          },
          "returnedToSender": {
            "eligible": true,
            "reasonKey": "order-item:returned_to_sender",
            "remedy": "refund_paid_item_total",
          },
        },
        "version": "v1",
      }
    `);
  });
});
