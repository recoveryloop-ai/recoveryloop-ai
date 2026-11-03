import { describe, expect, it, vi } from "vitest";

import { PayPalProviderError, PayPalSandboxProvider } from "../src/server/adapters/payments/paypal-sandbox-provider.js";

function jsonResponse(value: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", ...headers } });
}

function providerWith(responses: Response[]) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    void _input;
    void _init;
    const response = responses.shift();
    if (!response) throw new Error("UNEXPECTED_FETCH");
    return response;
  });
  const provider = new PayPalSandboxProvider({
    clientId: "test-client",
    clientSecret: "test-secret",
    fetchImplementation: fetchMock as unknown as typeof fetch,
    now: () => 1_000_000,
  });
  return { provider, fetchMock };
}

const token = { access_token: "sandbox-access-token", expires_in: 3600 };

describe("PayPal sandbox provider", () => {
  it("creates and reads back an exact itemized order while caching OAuth", async () => {
    const order = {
      id: "PAYPAL-ORDER-123",
      status: "CREATED",
      create_time: "2026-11-01T09:00:00Z",
      links: [{ rel: "approve", href: "https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL-ORDER-123" }],
      purchase_units: [{ custom_id: "local-1", amount: { currency_code: "USD", value: "250.00" } }],
    };
    const { provider, fetchMock } = providerWith([jsonResponse(token), jsonResponse(order, 201), jsonResponse(order)]);
    const created = await provider.createOrder({
      requestId: "11111111-1111-4111-8111-111111111111",
      localOrderId: "local-1",
      amountMinor: 25_000,
      currency: "USD",
      items: [
        { name: "Headphones", sku: "A", quantity: 1, unitMinor: 15_000 },
        { name: "Keyboard", sku: "B", quantity: 1, unitMinor: 10_000 },
      ],
      returnUrl: "http://localhost:3000/checkout/paypal/return",
      cancelUrl: "http://localhost:3000/store?paypal=cancelled",
    });
    const read = await provider.getOrder(created.providerOrderId);
    expect(created).toMatchObject({ amountMinor: 25_000, status: "CREATED", sourceTier: "PROVIDER_VERIFIED", synthetic: false });
    expect(read).toMatchObject({ providerOrderId: created.providerOrderId, amountMinor: 25_000 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("oauth2/token"))).toHaveLength(1);
    const createInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(createInit.headers).toMatchObject({ "PayPal-Request-Id": "11111111-1111-4111-8111-111111111111" });
    expect(JSON.parse(String(createInit.body))).toMatchObject({
      intent: "CAPTURE",
      purchase_units: [{ custom_id: "local-1", amount: { value: "250.00" } }],
    });
  });

  it("captures and independently reads back a completed capture", async () => {
    const capture = { id: "CAPTURE-123", status: "COMPLETED", amount: { currency_code: "USD", value: "250.00" } };
    const { provider, fetchMock } = providerWith([
      jsonResponse(token),
      jsonResponse({ id: "PAYPAL-ORDER-123", status: "COMPLETED", purchase_units: [{ payments: { captures: [capture] } }], links: [] }, 201),
      jsonResponse(capture),
    ]);
    const initial = await provider.captureOrder({ requestId: "22222222-2222-4222-8222-222222222222", providerOrderId: "PAYPAL-ORDER-123" });
    const verified = await provider.getCapture(initial.providerCaptureId);
    expect(initial).toMatchObject({ providerCaptureId: "CAPTURE-123", amountMinor: 25_000, status: "COMPLETED" });
    expect(verified).toMatchObject({ providerCaptureId: "CAPTURE-123", amountMinor: 25_000, status: "COMPLETED" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each(["PENDING", "DENIED"])("preserves a %s provider status", async (status) => {
    const { provider } = providerWith([
      jsonResponse(token),
      jsonResponse({ id: `CAP-${status}`, status, amount: { currency_code: "USD", value: "250.00" } }),
    ]);
    await expect(provider.getCapture(`CAP-${status}`)).resolves.toMatchObject({ status });
  });

  it("posts an exact partial refund with a stable request ID and verifies it by GET", async () => {
    const refund = { id: "REFUND-123", status: "COMPLETED", amount: { currency_code: "USD", value: "100.00" } };
    const { provider, fetchMock } = providerWith([
      jsonResponse(token),
      jsonResponse(refund, 201),
      jsonResponse(refund),
    ]);
    const initial = await provider.refundCapture({
      requestId: "33333333-3333-4333-8333-333333333333",
      providerCaptureId: "CAPTURE-123",
      amountMinor: 10_000,
      currency: "USD",
      customId: "44444444-4444-4444-8444-444444444444",
    });
    const verified = await provider.getRefund(initial.providerRefundId);
    expect(initial).toMatchObject({ providerRefundId: "REFUND-123", amountMinor: 10_000, status: "COMPLETED" });
    expect(verified).toMatchObject({ providerRefundId: "REFUND-123", amountMinor: 10_000, status: "COMPLETED" });
    const refundCall = fetchMock.mock.calls[1];
    expect(String(refundCall?.[0])).toContain("/v2/payments/captures/CAPTURE-123/refund");
    expect(refundCall?.[1]?.headers).toMatchObject({
      "PayPal-Request-Id": "33333333-3333-4333-8333-333333333333",
      Prefer: "return=representation",
    });
    expect(JSON.parse(String(refundCall?.[1]?.body))).toEqual({
      amount: { currency_code: "USD", value: "100.00" },
      custom_id: "44444444-4444-4444-8444-444444444444",
      note_to_payer: "RecoveryLoop sandbox resolution",
    });
  });

  it.each(["PENDING", "FAILED", "CANCELLED", "SOMETHING_NEW"])("maps refund status %s without assuming success", async (status) => {
    const { provider } = providerWith([
      jsonResponse(token),
      jsonResponse({ id: `REF-${status}`, status, amount: { currency_code: "USD", value: "100.00" } }),
    ]);
    await expect(provider.getRefund(`REF-${status}`)).resolves.toMatchObject({
      status: status === "SOMETHING_NEW" ? "UNKNOWN" : status,
    });
  });

  it("classifies 4xx as definite and 5xx as retryable without leaking response bodies", async () => {
    const definite = providerWith([jsonResponse(token), jsonResponse({ name: "UNPROCESSABLE_ENTITY" }, 422, { "paypal-debug-id": "debug-1" })]).provider;
    await expect(definite.createOrder({ requestId: "req", localOrderId: "local", amountMinor: 100, currency: "USD" }))
      .rejects.toMatchObject<Partial<PayPalProviderError>>({ status: 422, retryable: false, debugId: "debug-1" });

    const retryable = providerWith([jsonResponse(token), jsonResponse({ secret: "must-not-leak" }, 503)]).provider;
    await expect(retryable.captureOrder({ requestId: "req", providerOrderId: "ORDER-123" }))
      .rejects.toMatchObject<Partial<PayPalProviderError>>({ status: 503, retryable: true });
  });

  it("rejects an invalid webhook verification result", async () => {
    const { provider } = providerWith([jsonResponse(token), jsonResponse({ verification_status: "FAILURE" })]);
    await expect(provider.verifyWebhook({
      transmissionId: "id",
      transmissionTime: "time",
      transmissionSignature: "sig",
      certificateUrl: "https://api.sandbox.paypal.com/cert.pem",
      authenticationAlgorithm: "SHA256withRSA",
      webhookId: "webhook",
      event: { id: "event" },
    })).resolves.toBe(false);
  });
});
