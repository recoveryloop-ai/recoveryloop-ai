export type PaymentSourceTier = "PROVIDER_VERIFIED" | "SYNTHETIC";
export type PaymentOrderStatus =
  | "CREATED"
  | "APPROVED"
  | "COMPLETED"
  | "VOIDED"
  | "PAYER_ACTION_REQUIRED"
  | "UNKNOWN";
export type PaymentCaptureStatus = "COMPLETED" | "PENDING" | "DECLINED" | "DENIED" | "UNKNOWN";
export type PaymentRefundStatus = "COMPLETED" | "PENDING" | "FAILED" | "CANCELLED" | "UNKNOWN";

export type PaymentLineItem = {
  name: string;
  sku: string;
  quantity: number;
  unitMinor: number;
};

export type CreatePaymentOrderInput = {
  requestId: string;
  localOrderId: string;
  amountMinor: number;
  currency: "USD";
  items?: readonly PaymentLineItem[];
  returnUrl?: string;
  cancelUrl?: string;
};

export type PaymentOrder = {
  providerOrderId: string;
  localOrderId: string;
  amountMinor: number;
  currency: "USD";
  status: PaymentOrderStatus;
  sourceTier: PaymentSourceTier;
  synthetic: boolean;
  approvalUrl: string | null;
  providerCreatedAt: string | null;
};

export type CapturePaymentOrderInput = {
  requestId: string;
  providerOrderId: string;
};

export type PaymentCapture = {
  providerCaptureId: string;
  providerOrderId: string;
  amountMinor: number;
  currency: "USD";
  status: PaymentCaptureStatus;
  sourceTier: PaymentSourceTier;
  synthetic: boolean;
  verifiedAt: string | null;
};

export type RefundPaymentCaptureInput = {
  requestId: string;
  providerCaptureId: string;
  amountMinor: number;
  currency: "USD";
  customId: string;
};

export type PaymentRefund = {
  providerRefundId: string;
  providerCaptureId: string;
  amountMinor: number;
  currency: "USD";
  status: PaymentRefundStatus;
  sourceTier: PaymentSourceTier;
  synthetic: boolean;
  verifiedAt: string | null;
};

export type VerifyPayPalWebhookInput = {
  transmissionId: string;
  transmissionTime: string;
  transmissionSignature: string;
  certificateUrl: string;
  authenticationAlgorithm: string;
  webhookId: string;
  event: unknown;
};

export interface PaymentProvider {
  readonly name: "paypal";
  readonly implementation: "mock" | "sandbox";
  createOrder(input: CreatePaymentOrderInput): Promise<PaymentOrder>;
  getOrder(providerOrderId: string): Promise<PaymentOrder | null>;
  captureOrder(input: CapturePaymentOrderInput): Promise<PaymentCapture>;
  getCapture(providerCaptureId: string): Promise<PaymentCapture | null>;
  refundCapture(input: RefundPaymentCaptureInput): Promise<PaymentRefund>;
  getRefund(providerRefundId: string): Promise<PaymentRefund | null>;
  verifyWebhook(input: VerifyPayPalWebhookInput): Promise<boolean>;
}
