import { createHash, randomUUID } from "node:crypto";

import { createDatabase } from "../../db/client";
import { PayPalProviderError } from "../../adapters/payments/paypal-sandbox-provider";
import type { PaymentCapture, PaymentProvider } from "../../adapters/payments/payment-provider";
import { AppError } from "../../http/app-error";
import { buildStaticCart } from "../commerce/catalog";
import { decideCapture } from "./capture-guard";

type OperatorContext = { merchantId: string; policyVersionId: string };

export interface CheckoutResult {
  readonly localOrderId: string;
  readonly providerOrderId: string;
  readonly approvalUrl: string;
  readonly status: string;
}

export interface CaptureResult {
  readonly localOrderId: string;
  readonly capture: PaymentCapture;
}

export interface CheckoutServiceOptions {
  readonly databaseUrl: string;
  readonly paymentProvider: PaymentProvider;
  readonly appBaseUrl: string;
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export class CheckoutService {
  constructor(private readonly options: CheckoutServiceOptions) {}

  async createOrder(authSubject: string, requestId: string): Promise<CheckoutResult> {
    const { client } = createDatabase(this.options.databaseUrl);
    const cart = buildStaticCart();
    let localOrderId: string;
    try {
      const context = await this.getOperatorContext(client, authSubject);
      const [existing] = await client<{
        order_id: string;
        paypal_order_id: string;
        approval_url: string;
        status: string;
      }[]>`select po.order_id, po.paypal_order_id, po.approval_url, po.status
        from paypal_orders po join orders o on o.id = po.order_id
        where po.create_request_id = ${requestId} and o.merchant_id = ${context.merchantId}`;
      if (existing) {
        return {
          localOrderId: existing.order_id,
          providerOrderId: existing.paypal_order_id,
          approvalUrl: existing.approval_url,
          status: existing.status,
        };
      }

      const [localOrder] = await client<{ id: string }[]>`insert into orders
        (merchant_id, external_ref, checkout_request_id, currency, total_minor, status, policy_version_id)
        values (${context.merchantId}, ${`S2-${requestId}`}, ${requestId}, 'USD', ${cart.total.minor}, 'CHECKOUT_CREATED', ${context.policyVersionId})
        on conflict (checkout_request_id) do update set checkout_request_id = excluded.checkout_request_id
        returning id`;
      if (!localOrder) throw new AppError("LOCAL_ORDER_CREATE_FAILED", 500);
      localOrderId = localOrder.id;

      await client.begin(async (sql) => {
        for (const line of cart.lines) {
          await sql`insert into order_items
            (order_id, sku, name, quantity, unit_minor, tax_minor, shipping_allocation_minor, fulfillment_status)
            values (${localOrderId}, ${line.item.sku}, ${line.item.name}, ${line.quantity}, ${line.item.unit.minor}, 0, 0, 'UNFULFILLED')
            on conflict (order_id, sku) do nothing`;
        }
      });

      const providerOrder = await this.options.paymentProvider.createOrder({
        requestId,
        localOrderId,
        amountMinor: cart.total.minor,
        currency: "USD",
        items: cart.lines.map((line) => ({
          name: line.item.name,
          sku: line.item.sku,
          quantity: line.quantity,
          unitMinor: line.item.unit.minor,
        })),
        returnUrl: `${this.options.appBaseUrl}/checkout/paypal/return`,
        cancelUrl: `${this.options.appBaseUrl}/store?paypal=cancelled`,
      });
      if (providerOrder.synthetic || providerOrder.sourceTier !== "PROVIDER_VERIFIED") {
        throw new AppError("REAL_SANDBOX_PROVIDER_REQUIRED", 503);
      }
      if (!providerOrder.approvalUrl) throw new AppError("PAYPAL_APPROVAL_URL_MISSING", 502);

      await client.begin(async (sql) => {
        await sql`insert into paypal_orders
          (order_id, paypal_order_id, create_request_id, status, approval_url, provider_response_hash, provider_created_at, last_verified_at)
          values (${localOrderId}, ${providerOrder.providerOrderId}, ${requestId}, ${providerOrder.status}, ${providerOrder.approvalUrl},
            ${hashJson(providerOrder)}, ${providerOrder.providerCreatedAt}, now())
          on conflict (create_request_id) do update set
            paypal_order_id = excluded.paypal_order_id,
            status = excluded.status,
            approval_url = excluded.approval_url,
            provider_response_hash = excluded.provider_response_hash,
            last_verified_at = now(),
            updated_at = now()`;
        await sql`update orders set status = 'PAYPAL_CREATED' where id = ${localOrderId}`;
        await sql`insert into audit_events (merchant_id, actor, event_type, details_hash, details)
          values (${context.merchantId}, ${authSubject}, 'PAYPAL_ORDER_CREATED', ${hashJson(providerOrder)},
            ${JSON.stringify({ orderId: localOrderId, providerOrderId: providerOrder.providerOrderId, sourceTier: providerOrder.sourceTier })}::jsonb)`;
      });

      return {
        localOrderId,
        providerOrderId: providerOrder.providerOrderId,
        approvalUrl: providerOrder.approvalUrl,
        status: providerOrder.status,
      };
    } catch (error) {
      if (typeof localOrderId! === "string") {
        await client`update orders set status = 'CHECKOUT_FAILED' where id = ${localOrderId!}`.catch(() => undefined);
      }
      throw error;
    } finally {
      await client.end();
    }
  }

  async captureOrder(authSubject: string, providerOrderId: string): Promise<CaptureResult> {
    const { client } = createDatabase(this.options.databaseUrl);
    let captureRequestId: string | null = null;
    let localOrderId = "";
    try {
      const context = await this.getOperatorContext(client, authSubject);
      const providerOrder = await this.options.paymentProvider.getOrder(providerOrderId);
      if (!providerOrder) throw new AppError("PAYPAL_ORDER_NOT_FOUND", 404);

      const claim = await client.begin(async (sql) => {
        const [mapping] = await sql<{
          local_order_id: string;
          status: string;
          capture_request_id: string | null;
          total_minor: number;
        }[]>`select po.order_id as local_order_id, po.status, po.capture_request_id, o.total_minor
          from paypal_orders po join orders o on o.id = po.order_id
          where po.paypal_order_id = ${providerOrderId} and o.merchant_id = ${context.merchantId}
          for update of po`;
        if (!mapping) throw new AppError("PAYPAL_ORDER_NOT_FOUND", 404);
        localOrderId = mapping.local_order_id;

        const [existingCapture] = await sql<{
          provider_capture_id: string;
          captured_minor: number;
          currency: "USD";
          status: PaymentCapture["status"];
          verified_at: Date | null;
        }[]>`select provider_capture_id, captured_minor, currency, status, verified_at
          from captures where order_id = ${localOrderId} and provider = 'PAYPAL' limit 1`;
        const decision = decideCapture(mapping.status, providerOrder.status, Boolean(existingCapture));
        if (decision === "RETURN_EXISTING" && existingCapture) {
          return {
            completed: {
              localOrderId,
              capture: {
                providerCaptureId: existingCapture.provider_capture_id,
                providerOrderId,
                amountMinor: existingCapture.captured_minor,
                currency: existingCapture.currency,
                status: existingCapture.status,
                sourceTier: "PROVIDER_VERIFIED" as const,
                synthetic: false,
                verifiedAt: existingCapture.verified_at?.toISOString() ?? null,
              },
            },
            requestId: null,
            totalMinor: mapping.total_minor,
          };
        }
        const requestId = mapping.capture_request_id ?? randomUUID();
        await sql`update paypal_orders set status = 'CAPTURING', capture_request_id = ${requestId},
          provider_response_hash = ${hashJson(providerOrder)}, last_verified_at = now(), updated_at = now()
          where paypal_order_id = ${providerOrderId}`;
        return { completed: null, requestId, totalMinor: mapping.total_minor };
      });
      if (claim.completed) return claim.completed;
      captureRequestId = claim.requestId;
      if (!captureRequestId) throw new AppError("CAPTURE_REQUEST_ID_MISSING", 500);

      const initialCapture = await this.options.paymentProvider.captureOrder({ requestId: captureRequestId, providerOrderId });
      const verifiedCapture = await this.options.paymentProvider.getCapture(initialCapture.providerCaptureId);
      if (!verifiedCapture) throw new AppError("CAPTURE_READ_BACK_MISSING", 502, true);
      if (
        verifiedCapture.providerCaptureId !== initialCapture.providerCaptureId ||
        verifiedCapture.amountMinor !== claim.totalMinor ||
        verifiedCapture.currency !== "USD"
      ) throw new AppError("CAPTURE_READ_BACK_MISMATCH", 502);

      const mappingStatus = verifiedCapture.status === "COMPLETED" ? "COMPLETED"
        : verifiedCapture.status === "PENDING" ? "PENDING"
          : verifiedCapture.status;
      const orderStatus = verifiedCapture.status === "COMPLETED" ? "PAID"
        : verifiedCapture.status === "PENDING" ? "PAYMENT_PENDING"
          : "PAYMENT_DENIED";

      await client.begin(async (sql) => {
        await sql`insert into captures
          (order_id, provider, provider_capture_id, status, captured_minor, currency, verified_at)
          values (${localOrderId}, 'PAYPAL', ${verifiedCapture.providerCaptureId}, ${verifiedCapture.status},
            ${verifiedCapture.amountMinor}, ${verifiedCapture.currency}, now())
          on conflict (provider, provider_capture_id) do update set
            status = excluded.status, captured_minor = excluded.captured_minor, currency = excluded.currency, verified_at = now()`;
        await sql`update paypal_orders set status = ${mappingStatus}, provider_response_hash = ${hashJson(verifiedCapture)},
          last_verified_at = now(), updated_at = now() where paypal_order_id = ${providerOrderId}`;
        await sql`update orders set status = ${orderStatus} where id = ${localOrderId}`;
        await sql`insert into audit_events (merchant_id, actor, event_type, details_hash, details)
          values (${context.merchantId}, ${authSubject}, 'PAYPAL_CAPTURE_VERIFIED', ${hashJson(verifiedCapture)},
            ${JSON.stringify({ orderId: localOrderId, captureId: verifiedCapture.providerCaptureId, status: verifiedCapture.status, sourceTier: verifiedCapture.sourceTier })}::jsonb)`;
      });
      return { localOrderId, capture: { ...verifiedCapture, providerOrderId } };
    } catch (error) {
      if (captureRequestId && localOrderId) {
        const status = error instanceof PayPalProviderError && !error.retryable ? "FAILED" : "UNKNOWN";
        await client`update paypal_orders set status = ${status}, updated_at = now()
          where paypal_order_id = ${providerOrderId} and capture_request_id = ${captureRequestId}`.catch(() => undefined);
      }
      throw error;
    } finally {
      await client.end();
    }
  }

  private async getOperatorContext(
    client: ReturnType<typeof createDatabase>["client"],
    authSubject: string,
  ): Promise<OperatorContext> {
    const [context] = await client<OperatorContext[]>`select u.merchant_id as "merchantId", p.id as "policyVersionId"
      from users u join policy_versions p on p.merchant_id = u.merchant_id and p.version = 'v1'
      where u.auth_subject = ${authSubject} and u.role in ('operator', 'admin') limit 1`;
    if (!context) throw new AppError("OPERATOR_MERCHANT_SCOPE_MISSING", 403);
    return context;
  }
}
