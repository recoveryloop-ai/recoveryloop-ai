import { randomUUID } from "node:crypto";
import { z } from "zod";

import { parseBaseEnvironment } from "../../src/server/config/runtime-env.js";
import {
  describeError,
  directExecution,
  loadLocalEnvironment,
  printResult,
  redactIdentifier,
  requireEnvironment,
  type SmokeResult,
} from "./common.js";

const tokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string(),
  expires_in: z.number(),
});

const orderSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
});

export async function smokePayPal(): Promise<SmokeResult> {
  loadLocalEnvironment();

  try {
    parseBaseEnvironment(process.env);
    const clientId = requireEnvironment("PAYPAL_CLIENT_ID");
    const clientSecret = requireEnvironment("PAYPAL_CLIENT_SECRET");
    const baseUrl = "https://api-m.sandbox.paypal.com";

    const tokenResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(15_000),
    });
    const tokenPayload: unknown = await tokenResponse.json();
    if (!tokenResponse.ok) throw new Error(`OAUTH_HTTP_${tokenResponse.status}`);
    const token = tokenSchema.parse(tokenPayload);

    const orderResponse = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `recoveryloop-s0-${randomUUID()}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            custom_id: "recoveryloop-s0-readiness",
            amount: { currency_code: "USD", value: "1.00" },
          },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const orderPayload: unknown = await orderResponse.json();
    if (!orderResponse.ok) throw new Error(`ORDER_HTTP_${orderResponse.status}`);
    const order = orderSchema.parse(orderPayload);

    return {
      provider: "PayPal",
      status: "PASS",
      capability: "Sandbox OAuth and create-order call without capture",
      evidence: {
        oauth_status: tokenResponse.status,
        order_status_code: orderResponse.status,
        order_id: redactIdentifier(order.id),
        order_status: order.status,
        token_type: token.token_type,
        token_expires_in_seconds: token.expires_in,
      },
    };
  } catch (error) {
    const message = describeError(error);
    return {
      provider: "PayPal",
      status: message.startsWith("MISSING_ENV:") ? "BLOCKED" : "FAIL",
      capability: "Sandbox OAuth and create-order call without capture",
      blocker: message,
    };
  }
}

if (directExecution(import.meta.url)) {
  printResult(await smokePayPal());
}
