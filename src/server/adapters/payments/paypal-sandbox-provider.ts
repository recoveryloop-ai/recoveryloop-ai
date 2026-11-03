import { z } from "zod";

import { formatPayPalAmount, money, parsePayPalAmount } from "../../../shared/money";
import type {
  CapturePaymentOrderInput,
  CreatePaymentOrderInput,
  PaymentCapture,
  PaymentCaptureStatus,
  PaymentOrder,
  PaymentOrderStatus,
  PaymentProvider,
  PaymentRefund,
  PaymentRefundStatus,
  RefundPaymentCaptureInput,
  VerifyPayPalWebhookInput,
} from "./payment-provider";

const PAYPAL_SANDBOX_BASE_URL = "https://api-m.sandbox.paypal.com";

const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
});

const amountSchema = z.object({
  currency_code: z.string(),
  value: z.string(),
});

const captureSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  amount: amountSchema,
  create_time: z.string().optional(),
  update_time: z.string().optional(),
});

const refundSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  amount: amountSchema,
  create_time: z.string().optional(),
  update_time: z.string().optional(),
});

const orderSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  create_time: z.string().optional(),
  links: z.array(z.object({ href: z.string().url(), rel: z.string(), method: z.string().optional() })).default([]),
  purchase_units: z.array(z.object({
    custom_id: z.string().optional(),
    amount: amountSchema.optional(),
    payments: z.object({ captures: z.array(captureSchema).default([]) }).optional(),
  })).default([]),
});

const webhookVerificationSchema = z.object({ verification_status: z.string() });

export class PayPalProviderError extends Error {
  constructor(
    readonly operation: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly debugId: string | null,
  ) {
    super(`PAYPAL_${operation}_HTTP_${status}`);
    this.name = "PayPalProviderError";
  }
}

export interface PayPalSandboxProviderOptions {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly fetchImplementation?: typeof fetch;
  readonly now?: () => number;
}

function mapOrderStatus(status: string): PaymentOrderStatus {
  if (status === "CREATED" || status === "APPROVED" || status === "COMPLETED" || status === "VOIDED" || status === "PAYER_ACTION_REQUIRED") return status;
  return "UNKNOWN";
}

function mapCaptureStatus(status: string): PaymentCaptureStatus {
  if (status === "COMPLETED" || status === "PENDING" || status === "DECLINED" || status === "DENIED") return status;
  return "UNKNOWN";
}

function mapRefundStatus(status: string): PaymentRefundStatus {
  if (status === "COMPLETED" || status === "PENDING" || status === "FAILED" || status === "CANCELLED") return status;
  return "UNKNOWN";
}

export class PayPalSandboxProvider implements PaymentProvider {
  readonly name = "paypal" as const;
  readonly implementation = "sandbox" as const;

  private readonly fetchImplementation: typeof fetch;
  private readonly now: () => number;
  private tokenCache: { value: string; expiresAt: number } | null = null;

  constructor(private readonly options: PayPalSandboxProviderOptions) {
    if (!options.clientId.trim() || !options.clientSecret.trim()) throw new Error("PAYPAL_CREDENTIALS_REQUIRED");
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.now = options.now ?? Date.now;
  }

  async createOrder(input: CreatePaymentOrderInput): Promise<PaymentOrder> {
    this.validateCreateInput(input);
    const itemTotal = input.items?.reduce((sum, item) => sum + (item.unitMinor * item.quantity), 0);
    if (itemTotal !== undefined && itemTotal !== input.amountMinor) throw new Error("ORDER_TOTAL_MISMATCH");

    const payload = await this.requestJson("ORDER_CREATE", "/v2/checkout/orders", {
      method: "POST",
      headers: { "PayPal-Request-Id": input.requestId, Prefer: "return=representation" },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          custom_id: input.localOrderId,
          amount: {
            currency_code: input.currency,
            value: formatPayPalAmount(money(input.amountMinor)),
            ...(input.items ? {
              breakdown: { item_total: { currency_code: input.currency, value: formatPayPalAmount(money(input.amountMinor)) } },
            } : {}),
          },
          ...(input.items ? {
            items: input.items.map((item) => ({
              name: item.name,
              sku: item.sku,
              quantity: item.quantity.toString(),
              unit_amount: { currency_code: input.currency, value: formatPayPalAmount(money(item.unitMinor)) },
            })),
          } : {}),
        }],
        application_context: {
          brand_name: "RecoveryLoop Demo Store",
          landing_page: "LOGIN",
          user_action: "PAY_NOW",
          shipping_preference: "NO_SHIPPING",
          ...(input.returnUrl ? { return_url: input.returnUrl } : {}),
          ...(input.cancelUrl ? { cancel_url: input.cancelUrl } : {}),
        },
      }),
    });
    return this.toPaymentOrder(orderSchema.parse(payload), input.localOrderId, input.amountMinor);
  }

  async getOrder(providerOrderId: string): Promise<PaymentOrder | null> {
    try {
      const payload = await this.requestJson("ORDER_READ", `/v2/checkout/orders/${encodeURIComponent(providerOrderId)}`);
      const order = orderSchema.parse(payload);
      const unit = order.purchase_units[0];
      if (!unit?.custom_id || !unit.amount) throw new Error("PAYPAL_ORDER_FIELDS_MISSING");
      const amount = parsePayPalAmount(unit.amount.value, unit.amount.currency_code);
      return this.toPaymentOrder(order, unit.custom_id, amount.minor);
    } catch (error) {
      if (error instanceof PayPalProviderError && error.status === 404) return null;
      throw error;
    }
  }

  async captureOrder(input: CapturePaymentOrderInput): Promise<PaymentCapture> {
    if (!input.requestId.trim()) throw new Error("REQUEST_ID_REQUIRED");
    const payload = await this.requestJson(
      "ORDER_CAPTURE",
      `/v2/checkout/orders/${encodeURIComponent(input.providerOrderId)}/capture`,
      { method: "POST", headers: { "PayPal-Request-Id": input.requestId, Prefer: "return=representation" }, body: "{}" },
    );
    const order = orderSchema.parse(payload);
    const capture = order.purchase_units.flatMap((unit) => unit.payments?.captures ?? [])[0];
    if (!capture) throw new Error("PAYPAL_CAPTURE_MISSING");
    return this.toPaymentCapture(capture, input.providerOrderId, null);
  }

  async getCapture(providerCaptureId: string): Promise<PaymentCapture | null> {
    try {
      const payload = await this.requestJson("CAPTURE_READ", `/v2/payments/captures/${encodeURIComponent(providerCaptureId)}`);
      const capture = captureSchema.parse(payload);
      return this.toPaymentCapture(capture, "", new Date(this.now()).toISOString());
    } catch (error) {
      if (error instanceof PayPalProviderError && error.status === 404) return null;
      throw error;
    }
  }

  async refundCapture(input: RefundPaymentCaptureInput): Promise<PaymentRefund> {
    if (!input.requestId.trim()) throw new Error("REQUEST_ID_REQUIRED");
    if (!input.providerCaptureId.trim()) throw new Error("CAPTURE_ID_REQUIRED");
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new Error("INVALID_INTEGER_MINOR_AMOUNT");
    if (input.currency !== "USD") throw new Error("UNSUPPORTED_CURRENCY");
    const payload = await this.requestJson(
      "CAPTURE_REFUND",
      `/v2/payments/captures/${encodeURIComponent(input.providerCaptureId)}/refund`,
      {
        method: "POST",
        headers: { "PayPal-Request-Id": input.requestId, Prefer: "return=representation" },
        body: JSON.stringify({
          amount: { currency_code: input.currency, value: formatPayPalAmount(money(input.amountMinor)) },
          custom_id: input.customId,
          note_to_payer: "RecoveryLoop sandbox resolution",
        }),
      },
    );
    return this.toPaymentRefund(refundSchema.parse(payload), input.providerCaptureId, null);
  }

  async getRefund(providerRefundId: string): Promise<PaymentRefund | null> {
    try {
      const payload = await this.requestJson("REFUND_READ", `/v2/payments/refunds/${encodeURIComponent(providerRefundId)}`);
      return this.toPaymentRefund(refundSchema.parse(payload), "", new Date(this.now()).toISOString());
    } catch (error) {
      if (error instanceof PayPalProviderError && error.status === 404) return null;
      throw error;
    }
  }

  async verifyWebhook(input: VerifyPayPalWebhookInput): Promise<boolean> {
    const payload = await this.requestJson("WEBHOOK_VERIFY", "/v1/notifications/verify-webhook-signature", {
      method: "POST",
      body: JSON.stringify({
        transmission_id: input.transmissionId,
        transmission_time: input.transmissionTime,
        cert_url: input.certificateUrl,
        auth_algo: input.authenticationAlgorithm,
        transmission_sig: input.transmissionSignature,
        webhook_id: input.webhookId,
        webhook_event: input.event,
      }),
    });
    return webhookVerificationSchema.parse(payload).verification_status === "SUCCESS";
  }

  private validateCreateInput(input: CreatePaymentOrderInput): void {
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new Error("INVALID_INTEGER_MINOR_AMOUNT");
    if (input.currency !== "USD") throw new Error("UNSUPPORTED_CURRENCY");
    if (!input.requestId.trim()) throw new Error("REQUEST_ID_REQUIRED");
    if (!input.localOrderId.trim()) throw new Error("LOCAL_ORDER_ID_REQUIRED");
    for (const item of input.items ?? []) {
      if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) throw new Error("INVALID_ITEM_QUANTITY");
      if (!Number.isSafeInteger(item.unitMinor) || item.unitMinor <= 0) throw new Error("INVALID_INTEGER_MINOR_AMOUNT");
    }
  }

  private toPaymentOrder(order: z.infer<typeof orderSchema>, localOrderId: string, amountMinor: number): PaymentOrder {
    return {
      providerOrderId: order.id,
      localOrderId,
      amountMinor,
      currency: "USD",
      status: mapOrderStatus(order.status),
      sourceTier: "PROVIDER_VERIFIED",
      synthetic: false,
      approvalUrl: order.links.find((link) => link.rel === "approve" || link.rel === "payer-action")?.href ?? null,
      providerCreatedAt: order.create_time ?? null,
    };
  }

  private toPaymentCapture(
    capture: z.infer<typeof captureSchema>,
    providerOrderId: string,
    verifiedAt: string | null,
  ): PaymentCapture {
    const amount = parsePayPalAmount(capture.amount.value, capture.amount.currency_code);
    return {
      providerCaptureId: capture.id,
      providerOrderId,
      amountMinor: amount.minor,
      currency: amount.currency,
      status: mapCaptureStatus(capture.status),
      sourceTier: "PROVIDER_VERIFIED",
      synthetic: false,
      verifiedAt,
    };
  }

  private toPaymentRefund(
    refund: z.infer<typeof refundSchema>,
    providerCaptureId: string,
    verifiedAt: string | null,
  ): PaymentRefund {
    const amount = parsePayPalAmount(refund.amount.value, refund.amount.currency_code);
    return {
      providerRefundId: refund.id,
      providerCaptureId,
      amountMinor: amount.minor,
      currency: amount.currency,
      status: mapRefundStatus(refund.status),
      sourceTier: "PROVIDER_VERIFIED",
      synthetic: false,
      verifiedAt,
    };
  }

  private async getAccessToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > this.now() + 30_000) return this.tokenCache.value;
    const response = await this.fetchImplementation(`${PAYPAL_SANDBOX_BASE_URL}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.options.clientId}:${this.options.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw this.httpError("OAUTH", response);
    const token = tokenSchema.parse(await response.json());
    this.tokenCache = { value: token.access_token, expiresAt: this.now() + (token.expires_in * 1000) };
    return token.access_token;
  }

  private async requestJson(operation: string, path: string, init: RequestInit = {}): Promise<unknown> {
    const accessToken = await this.getAccessToken();
    const response = await this.fetchImplementation(`${PAYPAL_SANDBOX_BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...init.headers,
      },
      signal: init.signal ?? AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw this.httpError(operation, response);
    return response.json();
  }

  private httpError(operation: string, response: Response): PayPalProviderError {
    const status = response.status;
    return new PayPalProviderError(operation, status, status === 408 || status === 429 || status >= 500, response.headers.get("paypal-debug-id"));
  }
}
