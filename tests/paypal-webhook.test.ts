import { describe, expect, it } from "vitest";

import { parsePayPalWebhookRequest } from "../src/server/adapters/payments/paypal-webhook.js";

describe("PayPal webhook boundary", () => {
  it("rejects a webhook before provider traffic when signature headers are absent", () => {
    const request = new Request("http://localhost:3000/api/webhooks/paypal", { method: "POST" });
    expect(() => parsePayPalWebhookRequest(request, JSON.stringify({ id: "event-1", event_type: "PAYMENT.CAPTURE.COMPLETED" }), "webhook-1"))
      .toThrow("PAYPAL_WEBHOOK_HEADERS_INVALID");
  });

  it("preserves the exact event object for PayPal verification", () => {
    const headers = new Headers({
      "paypal-transmission-id": "transmission-1",
      "paypal-transmission-time": "2026-11-01T09:00:00Z",
      "paypal-transmission-sig": "signature",
      "paypal-cert-url": "https://api.sandbox.paypal.com/cert.pem",
      "paypal-auth-algo": "SHA256withRSA",
    });
    const request = new Request("http://localhost:3000/api/webhooks/paypal", { method: "POST", headers });
    const event = { id: "event-1", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "capture-1" } };
    expect(parsePayPalWebhookRequest(request, JSON.stringify(event), "webhook-1").verification.event).toEqual(event);
  });
});
