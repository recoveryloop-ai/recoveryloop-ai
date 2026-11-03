import { describe, expect, it } from "vitest";

import { AppError } from "../src/server/http/app-error";
import { assertCapturePreflight } from "../src/server/modules/payments/checkout-service";
import { toIsoTimestamp } from "../src/shared/timestamp";

const providerOrder = {
  providerOrderId: "PAYPAL-ORDER-1",
  localOrderId: "10000000-0000-4000-8000-000000000001",
  amountMinor: 25_000,
  currency: "USD" as const,
  status: "APPROVED" as const,
  sourceTier: "PROVIDER_VERIFIED" as const,
  synthetic: false,
  approvalUrl: null,
  providerCreatedAt: "2026-11-03T12:00:00.000Z",
};

describe("checkout service database timestamps", () => {
  it("normalizes PostgreSQL timestamp strings for an existing capture receipt", () => {
    expect(toIsoTimestamp("2026-11-03T12:34:56.789Z")).toBe("2026-11-03T12:34:56.789Z");
  });

  it("normalizes Date values and preserves null", () => {
    expect(toIsoTimestamp(new Date("2026-11-03T12:34:56.789Z"))).toBe("2026-11-03T12:34:56.789Z");
    expect(toIsoTimestamp(null)).toBeNull();
  });
});

describe("checkout service capture preflight", () => {
  it("accepts a provider order bound to the locked local order and total", () => {
    expect(() => assertCapturePreflight(providerOrder, providerOrder.localOrderId, 25_000)).not.toThrow();
  });

  it.each([
    [{ ...providerOrder, localOrderId: "20000000-0000-4000-8000-000000000002" }, providerOrder.localOrderId, 25_000],
    [{ ...providerOrder, amountMinor: 24_999 }, providerOrder.localOrderId, 25_000],
    [{ ...providerOrder, synthetic: true, sourceTier: "SYNTHETIC" as const }, providerOrder.localOrderId, 25_000],
  ])("blocks a provider order whose immutable binding changed", (actual, localOrderId, totalMinor) => {
    try {
      assertCapturePreflight(actual, localOrderId, totalMinor);
      throw new Error("EXPECTED_CAPTURE_PREFLIGHT_FAILURE");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ code: "PAYPAL_ORDER_BINDING_MISMATCH", status: 409 });
    }
  });
});
