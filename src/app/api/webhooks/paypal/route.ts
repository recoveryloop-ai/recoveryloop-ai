import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { parsePayPalWebhookRequest } from "@/server/adapters/payments/paypal-webhook";
import { getPaymentProvider } from "@/server/adapters/payments/provider-factory";
import { createDatabase } from "@/server/db/client";
import { AppError } from "@/server/http/app-error";
import { routeErrorResponse } from "@/server/http/route-error";

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

    const { client } = createDatabase(process.env.DATABASE_URL ?? "");
    try {
      await client`insert into webhook_inbox (provider, event_id, verified, payload_hash)
        values ('PAYPAL', ${parsed.eventId}, true, ${createHash("sha256").update(rawBody).digest("hex")})
        on conflict (provider, event_id) do nothing`;
    } finally {
      await client.end();
    }
    return NextResponse.json({ received: true }, { status: 202 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
