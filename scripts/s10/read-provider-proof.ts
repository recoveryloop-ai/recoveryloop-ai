import { createDatabase } from "../../src/server/db/client";
import { PayPalSandboxProvider } from "../../src/server/adapters/payments/paypal-sandbox-provider";
import { EasyPostTestProvider } from "../../src/server/adapters/logistics/easypost-test-provider";
import { loadLocalEnvironment, requireEnvironment, redactIdentifier } from "../smoke/common";
loadLocalEnvironment();
if (requireEnvironment("PAYPAL_ENV") !== "sandbox")
  throw Error("SANDBOX_REQUIRED");
const { client } = createDatabase(requireEnvironment("DATABASE_URL"));
try {
  const [row] = await client<{
    capture_id: string;
    refund_id: string;
  }[]> `select c.provider_capture_id as capture_id,r.provider_refund_id as refund_id from cases cs join captures c on c.order_id=cs.order_id join refunds r on r.capture_id=c.id where cs.external_ref='RG-2052' and c.provider='PAYPAL' and r.status='COMPLETED' limit 1`;
  if (!row)
    throw Error("PROVIDER_PROOF_MISSING");
  let captureRawStatus: string | undefined;
  const diagnosticFetch: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    if (String(input).includes("/v2/payments/")) {
      const data = await response.clone().json() as {
        id?: string;
        status?: string;
        amount?: {
          value: string;
          currency_code: string;
        };
      };
      if (String(input).includes("/captures/"))
        captureRawStatus = data.status;
      console.log(JSON.stringify({ provider: "PAYPAL SANDBOX", operation: "read-only raw diagnostic", httpStatus: response.status, id: data.id ? redactIdentifier(data.id) : null, rawStatus: data.status, amount: data.amount }));
    }
    return response;
  };
  const provider = new PayPalSandboxProvider({ clientId: requireEnvironment("PAYPAL_CLIENT_ID"), clientSecret: requireEnvironment("PAYPAL_CLIENT_SECRET"), fetchImplementation: diagnosticFetch });
  const capture = await provider.getCapture(row.capture_id);
  if (!capture || !["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(captureRawStatus ?? "") || capture.amountMinor !== 25000)
    throw Error("CAPTURE_READBACK_FAILED");
  console.log(JSON.stringify({ provider: "PAYPAL SANDBOX", operation: "GET capture", id: redactIdentifier(row.capture_id), rawStatus: captureRawStatus, adapterStatus: capture.status, amountMinor: capture.amountMinor, currency: capture.currency, sourceTier: capture.sourceTier }));
  const refund = await provider.getRefund(row.refund_id);
  if (!refund || refund.status !== "COMPLETED" || refund.amountMinor !== 10000)
    throw Error("REFUND_READBACK_FAILED");
  console.log(JSON.stringify({ provider: "PAYPAL SANDBOX", operation: "GET refund", id: redactIdentifier(row.refund_id), status: refund.status, amountMinor: refund.amountMinor, currency: refund.currency, sourceTier: refund.sourceTier, providerWrites: 0 }));
  const [shipment] = await client<{
    provider_tracker_id: string;
  }[]> `select provider_tracker_id from shipments where provider='EASYPOST' and synthetic_flag=false limit 1`;
  if (shipment) {
    const carrier = new EasyPostTestProvider({ apiKey: requireEnvironment("EASYPOST_API_KEY") });
    const tracker = await carrier.getTracker(shipment.provider_tracker_id);
    if (!tracker)
      throw Error("TRACKER_READBACK_FAILED");
    console.log(JSON.stringify({ provider: "EASYPOST TEST", operation: "GET tracker", status: tracker.status, sourceTier: tracker.sourceTier, providerWrites: 0 }));
  }
}
finally {
  await client.end();
}
