import { createHash } from "node:crypto";

import { createDatabase } from "../../src/server/db/client";
import { reconcileCaseObligationGraph, readCaseObligation } from "../../src/server/modules/obligations/obligation-graph-service";
import { loadLocalEnvironment, requireEnvironment } from "../smoke/common";

loadLocalEnvironment();
const databaseUrl = requireEnvironment("DATABASE_URL");
const { client } = createDatabase(databaseUrl);
const caseRef = "RG-2052";

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

try {
  await client.begin(async (sql) => {
    const [capture] = await sql<{
      id: string; order_id: string; provider_capture_id: string; status: string;
      captured_minor: number; currency: string; verified_at: Date | string | null;
    }[]>`select id, order_id, provider_capture_id, status, captured_minor, currency, verified_at
      from captures where provider = 'PAYPAL' order by created_at desc limit 1 for update`;
    if (!capture || capture.status !== "COMPLETED" || capture.captured_minor !== 25_000
      || capture.currency !== "USD" || !capture.verified_at) {
      throw new Error("S6_VERIFIED_250_CAPTURE_REQUIRED");
    }
    const [refundCount] = await sql<{ count: number }[]>`select count(*)::int as count from refunds where capture_id = ${capture.id}`;
    const [existingCase] = await sql<{ id: string; order_id: string }[]>`select id, order_id from cases where external_ref = ${caseRef}`;
    if (existingCase && existingCase.order_id !== capture.order_id) throw new Error("S6_CASE_CAPTURE_BINDING_CONFLICT");
    if ((refundCount?.count ?? 0) > 0 && !existingCase) throw new Error("S6_CAPTURE_ALREADY_REFUNDED_OUTSIDE_CASE");

    const [item] = await sql<{ id: string; unit_minor: number }[]>`select id, unit_minor from order_items
      where order_id = ${capture.order_id} and unit_minor = 10000 and quantity = 1 order by id limit 1 for update`;
    if (!item || item.unit_minor !== 10_000) throw new Error("S6_KEYBOARD_ITEM_REQUIRED");
    await sql`update order_items set fulfillment_status = 'RETURNED_TO_SENDER' where id = ${item.id}`;

    const [caseRow] = await sql<{ id: string }[]>`insert into cases
      (order_id, external_ref, kind, status, severity, detection_key, rule_key, source_tier, last_event_at)
      values (${capture.order_id}, ${caseRef}, 'DELIVERY_FAILURE', 'REVIEW_READY', 'MEDIUM',
        's6:real-capture:returned-to-sender', 'R01', 'SYNTHETIC', now())
      on conflict (external_ref) do update set updated_at = cases.updated_at
      returning id`;
    if (!caseRow) throw new Error("S6_CASE_CREATE_FAILED");

    const payload = {
      event: "RETURNED_TO_SENDER",
      itemId: item.id,
      source: "SYNTHETIC_OPERATOR_DEMO",
      disclaimer: "Synthetic fulfillment evidence attached to a real PayPal sandbox capture.",
    };
    await sql`insert into evidence
      (case_id, provider, source_tier, external_id, payload_hash, observed_at, synthetic_flag, redacted_json)
      values (${caseRow.id}, 'DEMO_OPERATOR', 'SYNTHETIC', 's6:synthetic:return-to-sender',
        ${hashJson(payload)}, now(), true, ${JSON.stringify(payload)}::jsonb)
      on conflict (case_id, external_id) do nothing`;
  });

  await reconcileCaseObligationGraph(databaseUrl, caseRef);
  const obligation = await readCaseObligation(databaseUrl, caseRef);
  if (obligation.decision !== "ALLOWED" || obligation.proposedRefundMinor !== 10_000) {
    const alreadySettled = obligation.reasonCodes.includes("REFUND_ALREADY_SETTLED") && obligation.realizedRefundMinor === 10_000;
    if (!alreadySettled) throw new Error(`S6_PREPARED_OBLIGATION_INVALID:${JSON.stringify(obligation)}`);
  }
  console.log(JSON.stringify({
    status: "PASS",
    operation: "s6-prepare-real-refund-case",
    caseRef,
    amountMinor: obligation.proposedRefundMinor || obligation.realizedRefundMinor,
    decision: obligation.decision,
    providerWrites: 0,
    evidenceTiers: ["PROVIDER_VERIFIED", "MERCHANT_ATTESTED", "SYNTHETIC"],
  }));
} finally {
  await client.end();
}
