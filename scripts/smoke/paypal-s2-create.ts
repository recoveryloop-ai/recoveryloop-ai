import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { getOperatorAccessToken } from "./paypal-s2-common";
import { loadLocalEnvironment, redactIdentifier, requireEnvironment } from "./common";

loadLocalEnvironment();

const baseUrl = requireEnvironment("APP_BASE_URL").replace(/\/$/, "");
const accessToken = await getOperatorAccessToken();
const requestId = randomUUID();
const body = new URLSearchParams({ request_id: requestId });
const response = await fetch(`${baseUrl}/api/paypal/orders`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    Origin: baseUrl,
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body,
  redirect: "manual",
  signal: AbortSignal.timeout(30_000),
});
const approvalUrl = response.headers.get("location");
if (response.status !== 303 || !approvalUrl?.startsWith("https://www.sandbox.paypal.com/")) {
  const payload = await response.text();
  throw new Error(`S2_CREATE_FAILED:${response.status}:${payload.slice(0, 300)}`);
}
const providerOrderId = new URL(approvalUrl).searchParams.get("token");
if (!providerOrderId) throw new Error("S2_APPROVAL_TOKEN_MISSING");
await writeFile(
  ".s2-checkout-state.json",
  `${JSON.stringify({ requestId, providerOrderId, approvalUrl }, null, 2)}\n`,
  { encoding: "utf8", mode: 0o600 },
);
console.log(JSON.stringify({
  status: "APPROVAL_REQUIRED",
  providerOrderId: redactIdentifier(providerOrderId),
  createHttpStatus: response.status,
  approvalUrl,
  stateFileMode: "0600",
}, null, 2));
