import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { parseEasyPostWebhookRequest } from "../src/server/adapters/logistics/easypost-webhook";

const secret = "test-webhook-secret";
const event = {
  id: "evt_test_123",
  description: "tracker.updated",
  mode: "test",
  result: { id: "trk_test_123", object: "Tracker", weight: 12.5 },
};

function hmac(message: string): string {
  return `hmac-sha256-hex=${createHmac("sha256", Buffer.from(secret.normalize("NFKD"), "utf8"))
    .update(message, "utf8")
    .digest("hex")}`;
}

describe("EasyPost webhook boundary", () => {
  it("validates the official legacy body signature and keeps test provenance", () => {
    const rawBody = JSON.stringify(event);
    const request = new Request("https://demo.example/api/webhooks/easypost", {
      method: "POST",
      headers: { "x-hmac-signature": hmac(rawBody) },
    });
    expect(parseEasyPostWebhookRequest(request, rawBody, secret)).toMatchObject({
      eventId: "evt_test_123",
      eventType: "tracker.updated",
      event: { mode: "test" },
    });
  });

  it("validates timestamped v2 signatures inside the replay window", () => {
    const rawBody = JSON.stringify(event);
    const timestamp = "Tue, 03 Nov 2026 12:00:00 +0000";
    const path = "/api/webhooks/easypost";
    const request = new Request(`https://demo.example${path}`, {
      method: "POST",
      headers: {
        "x-timestamp": timestamp,
        "x-path": path,
        "x-hmac-signature-v2": hmac(`${timestamp}POST${path}${rawBody}`),
      },
    });
    expect(parseEasyPostWebhookRequest(request, rawBody, secret, new Date("2026-11-03T12:00:30Z")).eventId)
      .toBe("evt_test_123");
  });

  it("rejects partial v2 headers, stale events, bad signatures and production events", () => {
    const rawBody = JSON.stringify(event);
    const partial = new Request("https://demo.example/api/webhooks/easypost", {
      method: "POST",
      headers: { "x-timestamp": "Tue, 03 Nov 2026 12:00:00 +0000" },
    });
    expect(() => parseEasyPostWebhookRequest(partial, rawBody, secret, new Date("2026-11-03T12:00:00Z")))
      .toThrow("EASYPOST_WEBHOOK_HEADERS_INVALID");

    const timestamp = "Tue, 03 Nov 2026 11:58:00 +0000";
    const path = "/api/webhooks/easypost";
    const stale = new Request(`https://demo.example${path}`, {
      method: "POST",
      headers: {
        "x-timestamp": timestamp,
        "x-path": path,
        "x-hmac-signature-v2": hmac(`${timestamp}POST${path}${rawBody}`),
      },
    });
    expect(() => parseEasyPostWebhookRequest(stale, rawBody, secret, new Date("2026-11-03T12:00:00Z")))
      .toThrow("EASYPOST_WEBHOOK_TIMESTAMP_OUT_OF_RANGE");

    const invalid = new Request(`https://demo.example${path}`, {
      method: "POST",
      headers: { "x-hmac-signature": "hmac-sha256-hex=invalid" },
    });
    expect(() => parseEasyPostWebhookRequest(invalid, rawBody, secret))
      .toThrow("EASYPOST_WEBHOOK_SIGNATURE_INVALID");

    const productionBody = JSON.stringify({ ...event, mode: "production" });
    const production = new Request(`https://demo.example${path}`, {
      method: "POST",
      headers: { "x-hmac-signature": hmac(productionBody) },
    });
    expect(() => parseEasyPostWebhookRequest(production, productionBody, secret))
      .toThrow("EASYPOST_WEBHOOK_EVENT_INVALID");
  });
});
