import { createHash } from "node:crypto";

import type {
  CreatePaymentOrderInput,
  PaymentOrder,
  PaymentProvider,
} from "./payment-provider.js";

export class MockPayPalProvider implements PaymentProvider {
  readonly name = "paypal" as const;
  readonly implementation = "mock" as const;

  private readonly ordersByProviderId = new Map<string, PaymentOrder>();
  private readonly providerIdByRequestId = new Map<string, string>();

  async createOrder(input: CreatePaymentOrderInput): Promise<PaymentOrder> {
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw new Error("INVALID_INTEGER_MINOR_AMOUNT");
    }
    if (input.currency !== "USD") throw new Error("UNSUPPORTED_CURRENCY");
    if (!input.requestId.trim()) throw new Error("REQUEST_ID_REQUIRED");

    const priorId = this.providerIdByRequestId.get(input.requestId);
    if (priorId) return this.ordersByProviderId.get(priorId)!;

    const digest = createHash("sha256")
      .update(`${input.requestId}:${input.localOrderId}`)
      .digest("hex")
      .slice(0, 16)
      .toUpperCase();
    const providerOrderId = `MOCK-PAYPAL-${digest}`;
    const order: PaymentOrder = {
      providerOrderId,
      localOrderId: input.localOrderId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: "CREATED",
      sourceTier: "SYNTHETIC",
      synthetic: true,
    };
    this.ordersByProviderId.set(providerOrderId, order);
    this.providerIdByRequestId.set(input.requestId, providerOrderId);
    return order;
  }

  async getOrder(providerOrderId: string): Promise<PaymentOrder | null> {
    return this.ordersByProviderId.get(providerOrderId) ?? null;
  }
}
