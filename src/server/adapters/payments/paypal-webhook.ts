import { z } from "zod";

import { AppError } from "../../http/app-error";
import type { VerifyPayPalWebhookInput } from "./payment-provider";

const eventSchema = z.object({ id: z.string().min(1), event_type: z.string().min(1) }).passthrough();

function requiredHeader(request: Request, name: string): string {
  const value = request.headers.get(name)?.trim();
  if (!value) throw new AppError("PAYPAL_WEBHOOK_HEADERS_INVALID", 400);
  return value;
}

export function parsePayPalWebhookRequest(request: Request, rawBody: string, webhookId: string): {
  eventId: string;
  eventType: string;
  verification: VerifyPayPalWebhookInput;
  event: unknown;
} {
  let value: unknown;
  try {
    value = JSON.parse(rawBody);
  } catch {
    throw new AppError("PAYPAL_WEBHOOK_JSON_INVALID", 400);
  }
  const parsed = eventSchema.safeParse(value);
  if (!parsed.success) throw new AppError("PAYPAL_WEBHOOK_EVENT_INVALID", 400);
  const event = parsed.data;
  return {
    eventId: event.id,
    eventType: event.event_type,
    event,
    verification: {
      transmissionId: requiredHeader(request, "paypal-transmission-id"),
      transmissionTime: requiredHeader(request, "paypal-transmission-time"),
      transmissionSignature: requiredHeader(request, "paypal-transmission-sig"),
      certificateUrl: requiredHeader(request, "paypal-cert-url"),
      authenticationAlgorithm: requiredHeader(request, "paypal-auth-algo"),
      webhookId,
      event,
    },
  };
}
