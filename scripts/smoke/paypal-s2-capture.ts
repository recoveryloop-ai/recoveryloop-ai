import { readFile } from "node:fs/promises";
import { z } from "zod";

import { createDatabase } from "../../src/server/db/client";
import { getOperatorAccessToken } from "./paypal-s2-common";
import { loadLocalEnvironment, redactIdentifier, requireEnvironment } from "./common";

loadLocalEnvironment();

const stateSchema = z.object({ providerOrderId: z.string().min(1) });
const state = stateSchema.parse(JSON.parse(await readFile(".s2-checkout-state.json", "utf8")));
const baseUrl = requireEnvironment("APP_BASE_URL").replace(/\/$/, "");
const accessToken = await getOperatorAccessToken();

async function capture(): Promise<Response> {
  return fetch(`${baseUrl}/api/paypal/orders/${encodeURIComponent(state.providerOrderId)}/capture`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, Origin: baseUrl },
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
}

const first = await capture();
if (first.status !== 303) throw new Error(`S2_CAPTURE_FAILED:${first.status}:${(await first.text()).slice(0, 300)}`);
const second = await capture();
if (second.status !== 303) throw new Error(`S2_DUPLICATE_CAPTURE_GUARD_FAILED:${second.status}:${(await second.text()).slice(0, 300)}`);

const { client } = createDatabase(requireEnvironment("DATABASE_URL"));
try {
  const [receipt] = await client<{
    local_order_id: string;
    paypal_order_id: string;
    paypal_status: string;
    capture_id: string;
    capture_status: string;
    captured_minor: number;
    currency: string;
    verified_at: Date | null;
    capture_count: number;
  }[]>`select o.id as local_order_id, po.paypal_order_id, po.status as paypal_status,
      c.provider_capture_id as capture_id, c.status as capture_status, c.captured_minor, c.currency, c.verified_at,
      (select count(*)::int from captures c2 where c2.order_id = o.id and c2.provider = 'PAYPAL') as capture_count
    from paypal_orders po join orders o on o.id = po.order_id
    join captures c on c.order_id = o.id and c.provider = 'PAYPAL'
    where po.paypal_order_id = ${state.providerOrderId}`;
  if (!receipt) throw new Error("S2_PERSISTED_RECEIPT_MISSING");
  if (receipt.paypal_order_id === receipt.capture_id) throw new Error("S2_ORDER_CAPTURE_IDS_NOT_DISTINCT");
  if (receipt.paypal_status !== "COMPLETED" || receipt.capture_status !== "COMPLETED") throw new Error("S2_CAPTURE_NOT_COMPLETED");
  if (receipt.captured_minor !== 25_000 || receipt.currency !== "USD") throw new Error("S2_CAPTURE_AMOUNT_MISMATCH");
  if (!receipt.verified_at || receipt.capture_count !== 1) throw new Error("S2_CAPTURE_VERIFICATION_FAILED");
  console.log(JSON.stringify({
    status: "PASS",
    firstCaptureHttpStatus: first.status,
    duplicateAttemptHttpStatus: second.status,
    localOrderId: redactIdentifier(receipt.local_order_id),
    paypalOrderId: redactIdentifier(receipt.paypal_order_id),
    captureId: redactIdentifier(receipt.capture_id),
    captureStatus: receipt.capture_status,
    amountMinor: receipt.captured_minor,
    currency: receipt.currency,
    verifiedAtPresent: true,
    captureRows: receipt.capture_count,
  }, null, 2));
} finally {
  await client.end();
}
