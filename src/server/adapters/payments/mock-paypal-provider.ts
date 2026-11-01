import { createHash } from "node:crypto";

import type {
  CapturePaymentOrderInput,
  CreatePaymentOrderInput,
  PaymentCapture,
  PaymentOrder,
  PaymentProvider,
} from "./payment-provider";

export class MockPayPalProvider implements PaymentProvider {
  readonly name = "paypal" as const;
  readonly implementation = "mock" as const;

  private readonly ordersByProviderId = new Map<string, PaymentOrder>();
  private readonly providerIdByRequestId = new Map<string, string>();
  private readonly capturesByProviderId = new Map<string, PaymentCapture>();
  private readonly captureIdByRequestId = new Map<string, string>();

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
      approvalUrl: null,
      providerCreatedAt: new Date(0).toISOString(),
    };
    this.ordersByProviderId.set(providerOrderId, order);
    this.providerIdByRequestId.set(input.requestId, providerOrderId);
    return order;
  }

  async getOrder(providerOrderId: string): Promise<PaymentOrder | null> {
    return this.ordersByProviderId.get(providerOrderId) ?? null;
  }

  async captureOrder(input: CapturePaymentOrderInput): Promise<PaymentCapture> {
    const order = this.ordersByProviderId.get(input.providerOrderId);
    if (!order) throw new Error("PAYMENT_ORDER_NOT_FOUND");
    const priorId = this.captureIdByRequestId.get(input.requestId);
    if (priorId) return this.capturesByProviderId.get(priorId)!;
    const providerCaptureId = `MOCK-CAPTURE-${input.providerOrderId.slice(-16)}`;
    const capture: PaymentCapture = {
      providerCaptureId,
      providerOrderId: input.providerOrderId,
      amountMinor: order.amountMinor,
      currency: order.currency,
      status: "COMPLETED",
      sourceTier: "SYNTHETIC",
      synthetic: true,
      verifiedAt: new Date(0).toISOString(),
    };
    this.captureIdByRequestId.set(input.requestId, providerCaptureId);
    this.capturesByProviderId.set(providerCaptureId, capture);
    this.ordersByProviderId.set(input.providerOrderId, { ...order, status: "COMPLETED" });
    return capture;
  }

  async getCapture(providerCaptureId: string): Promise<PaymentCapture | null> {
    return this.capturesByProviderId.get(providerCaptureId) ?? null;
  }

  async verifyWebhook(): Promise<boolean> {
    return false;
  }
}
