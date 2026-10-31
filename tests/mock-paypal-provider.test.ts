import { describe, expect, it } from "vitest";

import { MockPayPalProvider } from "../src/server/adapters/payments/mock-paypal-provider.js";
import { createPaymentProvider } from "../src/server/adapters/payments/provider-factory.js";

describe("mock PayPal provider", () => {
  it("returns explicitly synthetic evidence and never provider-verified evidence", async () => {
    const provider = new MockPayPalProvider();
    const order = await provider.createOrder({
      requestId: "request-1",
      localOrderId: "local-order-1",
      amountMinor: 25_000,
      currency: "USD",
    });

    expect(order.providerOrderId).toMatch(/^MOCK-PAYPAL-/);
    expect(order.sourceTier).toBe("SYNTHETIC");
    expect(order.synthetic).toBe(true);
    expect(order.status).toBe("CREATED");
  });

  it("is idempotent for the same request ID", async () => {
    const provider = new MockPayPalProvider();
    const input = {
      requestId: "stable-request",
      localOrderId: "local-order-2",
      amountMinor: 10_000,
      currency: "USD" as const,
    };

    const first = await provider.createOrder(input);
    const second = await provider.createOrder(input);
    expect(second).toEqual(first);
  });

  it("rejects non-integer money", async () => {
    const provider = new MockPayPalProvider();
    await expect(
      provider.createOrder({
        requestId: "request-invalid",
        localOrderId: "local-order-3",
        amountMinor: 100.5,
        currency: "USD",
      }),
    ).rejects.toThrow("INVALID_INTEGER_MINOR_AMOUNT");
  });

  it("requires demo mode and sandbox environment", () => {
    expect(() =>
      createPaymentProvider({
        DEMO_MODE: "false",
        PAYPAL_ENV: "sandbox",
        PAYPAL_PROVIDER: "mock",
      }),
    ).toThrow("MOCK_PAYPAL_REQUIRES_DEMO_MODE");
    expect(() =>
      createPaymentProvider({
        DEMO_MODE: "true",
        PAYPAL_ENV: "live",
        PAYPAL_PROVIDER: "mock",
      }),
    ).toThrow("PAYPAL_LIVE_FORBIDDEN_IN_DEMO_MODE");
  });

  it("fails closed when the real sandbox adapter is requested early", () => {
    expect(() =>
      createPaymentProvider({
        DEMO_MODE: "true",
        PAYPAL_ENV: "sandbox",
        PAYPAL_PROVIDER: "sandbox",
      }),
    ).toThrow("PAYPAL_SANDBOX_ADAPTER_NOT_CONFIGURED");
  });
});
