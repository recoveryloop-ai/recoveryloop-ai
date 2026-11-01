import { describe, expect, it } from "vitest";

import { decideCapture } from "../src/server/modules/payments/capture-guard.js";

describe("capture state guard", () => {
  it("returns a persisted completed capture instead of calling PayPal twice", () => {
    expect(decideCapture("COMPLETED", "COMPLETED", true)).toBe("RETURN_EXISTING");
  });

  it.each(["CAPTURING", "PENDING", "UNKNOWN", "DENIED", "DECLINED"])("blocks a second attempt while local status is %s", (status) => {
    expect(() => decideCapture(status, "APPROVED", false)).toThrow(`CAPTURE_${status}`);
  });

  it("requires provider approval before starting capture", () => {
    expect(() => decideCapture("CREATED", "CREATED", false)).toThrow("PAYPAL_ORDER_CREATED");
    expect(decideCapture("CREATED", "APPROVED", false)).toBe("START_CAPTURE");
  });
});
