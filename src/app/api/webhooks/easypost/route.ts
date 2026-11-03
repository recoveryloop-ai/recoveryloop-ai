import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { parseEasyPostWebhookRequest } from "@/server/adapters/logistics/easypost-webhook";
import { createDatabase } from "@/server/db/client";
import { AppError } from "@/server/http/app-error";
import { routeErrorResponse } from "@/server/http/route-error";

export async function POST(request: Request) {
  try {
    const webhookSecret = process.env.EASYPOST_WEBHOOK_SECRET?.trim();
    if (!webhookSecret || webhookSecret === "TEST_WEBHOOK_SECRET") {
      throw new AppError("EASYPOST_WEBHOOK_NOT_CONFIGURED", 503);
    }

    const rawBody = await request.text();
    const parsed = parseEasyPostWebhookRequest(request, rawBody, webhookSecret);
    const { client } = createDatabase(process.env.DATABASE_URL ?? "");
    try {
      await client`insert into webhook_inbox (provider, event_id, verified, payload_hash)
        values ('EASYPOST', ${parsed.eventId}, true, ${createHash("sha256").update(rawBody).digest("hex")})
        on conflict (provider, event_id) do nothing`;
    } finally {
      await client.end();
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
