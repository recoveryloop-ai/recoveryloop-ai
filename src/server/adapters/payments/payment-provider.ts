export type PaymentSourceTier = "PROVIDER_VERIFIED" | "SYNTHETIC";
export type PaymentOrderStatus = "CREATED" | "COMPLETED" | "UNKNOWN";

export type CreatePaymentOrderInput = {
  requestId: string;
  localOrderId: string;
  amountMinor: number;
  currency: "USD";
};

export type PaymentOrder = {
  providerOrderId: string;
  localOrderId: string;
  amountMinor: number;
  currency: "USD";
  status: PaymentOrderStatus;
  sourceTier: PaymentSourceTier;
  synthetic: boolean;
};

export interface PaymentProvider {
  readonly name: "paypal";
  readonly implementation: "mock" | "sandbox";
  createOrder(input: CreatePaymentOrderInput): Promise<PaymentOrder>;
  getOrder(providerOrderId: string): Promise<PaymentOrder | null>;
}
