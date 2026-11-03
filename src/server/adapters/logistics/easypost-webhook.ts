import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { AppError } from "../../http/app-error";

const EASYPOST_WEBHOOK_PATH = "/api/webhooks/easypost";
const MAX_EVENT_ID_LENGTH = 160;
const MAX_AGE_MS = 60_000;
const MAX_FUTURE_SKEW_MS = 30_000;

const eventSchema = z.object({
  id: z.string().min(1).max(MAX_EVENT_ID_LENGTH),
  description: z.string().min(1),
  mode: z.literal("test"),
}).passthrough();

function signatureDigest(secret: string, message: string): string {
  const normalizedSecret = secret.normalize("NFKD");
  return `hmac-sha256-hex=${createHmac("sha256", Buffer.from(normalizedSecret, "utf8"))
    .update(message, "utf8")
    .digest("hex")}`;
}

function signaturesMatch(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received.toLowerCase(), "utf8");
  const expectedBuffer = Buffer.from(expected.toLowerCase(), "utf8");
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

function correctedLegacyBody(rawBody: string): string {
  // Matches EasyPost's official Node client behavior for integer-valued weight fields.
  return rawBody.replace(/("weight":\s*)(\d+)(\s*)(?=,|\})/g, "$1$2.0");
}

function verifyLegacySignature(request: Request, rawBody: string, webhookSecret: string): string {
  const received = request.headers.get("x-hmac-signature")?.trim();
  if (!received) throw new AppError("EASYPOST_WEBHOOK_HEADERS_INVALID", 401);
  const body = correctedLegacyBody(rawBody);
  if (!signaturesMatch(received, signatureDigest(webhookSecret, body))) {
    throw new AppError("EASYPOST_WEBHOOK_SIGNATURE_INVALID", 401);
  }
  return body;
}

function verifyV2Signature(
  request: Request,
  rawBody: string,
  webhookSecret: string,
  now: Date,
): string {
  const timestamp = request.headers.get("x-timestamp")?.trim();
  const signedPath = request.headers.get("x-path")?.trim();
  const received = request.headers.get("x-hmac-signature-v2")?.trim();
  if (!timestamp || !signedPath || !received) {
    throw new AppError("EASYPOST_WEBHOOK_HEADERS_INVALID", 401);
  }

  const requestPath = new URL(request.url).pathname;
  if (signedPath !== requestPath || requestPath !== EASYPOST_WEBHOOK_PATH) {
    throw new AppError("EASYPOST_WEBHOOK_PATH_INVALID", 401);
  }

  const sentAt = new Date(timestamp);
  if (Number.isNaN(sentAt.valueOf())) throw new AppError("EASYPOST_WEBHOOK_TIMESTAMP_INVALID", 401);
  const ageMs = now.valueOf() - sentAt.valueOf();
  if (ageMs > MAX_AGE_MS || ageMs < -MAX_FUTURE_SKEW_MS) {
    throw new AppError("EASYPOST_WEBHOOK_TIMESTAMP_OUT_OF_RANGE", 401);
  }

  const message = `${timestamp}POST${signedPath}${rawBody}`;
  if (!signaturesMatch(received, signatureDigest(webhookSecret, message))) {
    throw new AppError("EASYPOST_WEBHOOK_SIGNATURE_INVALID", 401);
  }
  return rawBody;
}

export function parseEasyPostWebhookRequest(
  request: Request,
  rawBody: string,
  webhookSecret: string,
  now = new Date(),
): { eventId: string; eventType: string; event: unknown } {
  if (!webhookSecret.trim()) throw new AppError("EASYPOST_WEBHOOK_NOT_CONFIGURED", 503);

  const hasAnyV2Header = ["x-timestamp", "x-path", "x-hmac-signature-v2"]
    .some((name) => request.headers.has(name));
  const verifiedBody = hasAnyV2Header
    ? verifyV2Signature(request, rawBody, webhookSecret, now)
    : verifyLegacySignature(request, rawBody, webhookSecret);

  let value: unknown;
  try {
    value = JSON.parse(verifiedBody);
  } catch {
    throw new AppError("EASYPOST_WEBHOOK_JSON_INVALID", 400);
  }
  const parsed = eventSchema.safeParse(value);
  if (!parsed.success) throw new AppError("EASYPOST_WEBHOOK_EVENT_INVALID", 400);

  return {
    eventId: parsed.data.id,
    eventType: parsed.data.description,
    event: parsed.data,
  };
}
