import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { parsePayPalWebhookRequest } from "@/server/adapters/payments/paypal-webhook";
import { getPaymentProvider } from "@/server/adapters/payments/provider-factory";
import { AppError } from "@/server/http/app-error";
import { routeErrorResponse } from "@/server/http/route-error";
import { recordVerifiedPayPalEvent } from "@/server/modules/disputes/paypal-event-ingestion-service";

export async function POST(request: Request) {
  try {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
    if (!webhookId || webhookId === "SANDBOX_REGISTERED_WEBHOOK_ID") {
      throw new AppError("PAYPAL_WEBHOOK_NOT_CONFIGURED", 503);
    }
    const rawBody = await request.text();
    const parsed = parsePayPalWebhookRequest(request, rawBody, webhookId);
    const provider = getPaymentProvider(process.env);
    const verified = await provider.verifyWebhook(parsed.verification);
    if (!verified) throw new AppError("PAYPAL_WEBHOOK_SIGNATURE_INVALID", 400);

    // Only signature-verified events reach the ledger. Recording and applying the event
    // happen in one transaction, so a failure here returns an error and PayPal retries.
    const result = await recordVerifiedPayPalEvent(process.env.DATABASE_URL ?? "", {
      eventId: parsed.eventId,
      eventType: parsed.eventType,
      payloadHash: createHash("sha256").update(rawBody).digest("hex"),
      event: parsed.event,
    });
    return NextResponse.json({ received: true, duplicate: result.duplicate }, { status: 202 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
