import { createHash } from "node:crypto";

import { EasyPostTestProvider } from "../../src/server/adapters/logistics/easypost-test-provider";
import { createDatabase } from "../../src/server/db/client";
import { CarrierIngestionService } from "../../src/server/modules/logistics/carrier-ingestion-service";
import { loadLocalEnvironment, redactIdentifier, requireEnvironment } from "../smoke/common";

loadLocalEnvironment();

const databaseUrl = requireEnvironment("DATABASE_URL");
const provider = new EasyPostTestProvider({ apiKey: requireEnvironment("EASYPOST_API_KEY") });
const service = new CarrierIngestionService({ databaseUrl, carrierProvider: provider });

async function paymentLedgerHash(): Promise<string> {
  const { client } = createDatabase(databaseUrl);
  try {
    const captures = await client`select order_id, provider, provider_capture_id, status, captured_minor, currency, verified_at
      from captures order by id`;
    const refunds = await client`select capture_id, provider_refund_id, status, amount_minor, currency, verified_at
      from refunds order by id`;
    const paypalOrders = await client`select order_id, paypal_order_id, status, provider_response_hash, last_verified_at
      from paypal_orders order by id`;
    return createHash("sha256").update(JSON.stringify({ captures, refunds, paypalOrders })).digest("hex");
  } finally {
    await client.end();
  }
}

const input = { fixtureKey: "F02", itemSkus: ["B"], trackingCode: "EZ5000000005" } as const;
const paymentHashBefore = await paymentLedgerHash();
const first = await service.ingest(input);
const second = await service.ingest(input);
const paymentHashAfter = await paymentLedgerHash();

if (first.shipmentId !== second.shipmentId || first.caseId !== second.caseId) throw new Error("S3_REPLAY_IDENTITY_MISMATCH");
if (second.insertedEventCount !== 0) throw new Error(`S3_REPLAY_INSERTED_EVENTS:${second.insertedEventCount}`);
if (paymentHashBefore !== paymentHashAfter) throw new Error("S3_PAYMENT_LEDGER_CHANGED");
if (first.normalizedStatus !== "RETURN_TO_SENDER") throw new Error(`S3_STATUS_MISMATCH:${first.normalizedStatus}`);
if (!first.findings.some((finding) => finding.ruleId === "R01")) throw new Error("S3_R01_MISSING");

console.log(JSON.stringify({
  status: "PASS",
  operation: "s3-ingest-f02",
  provider: "EasyPost",
  providerMode: "test",
  trackerId: redactIdentifier(first.providerTrackerId),
  normalizedStatus: first.normalizedStatus,
  findings: first.findings.map((finding) => finding.ruleId),
  firstCaseAction: first.caseAction,
  replayCaseAction: second.caseAction,
  firstInsertedEvents: first.insertedEventCount,
  replayInsertedEvents: second.insertedEventCount,
  paymentLedgerUnchanged: true,
}));
