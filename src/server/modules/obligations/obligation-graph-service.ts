import { createHash } from "node:crypto";

import type { TransactionSql } from "postgres";

import { createDatabase } from "../../db/client";
import { AppError } from "../../http/app-error";
import { deriveObligation, type ObligationEngineOutput } from "./obligation-engine";

type EvidenceTier = "PROVIDER_VERIFIED" | "PROVIDER_TEST" | "MERCHANT_ATTESTED" | "SYNTHETIC";

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function upsertEvidence(
  sql: TransactionSql,
  input: {
    caseId: string;
    provider: string;
    sourceTier: EvidenceTier;
    externalId: string;
    observedAt: Date | string;
    synthetic: boolean;
    payload: unknown;
  },
): Promise<string> {
  const payloadHash = hashJson(input.payload);
  const [inserted] = await sql<{ id: string }[]>`insert into evidence
    (case_id, provider, source_tier, external_id, payload_hash, observed_at, synthetic_flag, redacted_json)
    values (${input.caseId}, ${input.provider}, ${input.sourceTier}, ${input.externalId}, ${payloadHash},
      ${input.observedAt}, ${input.synthetic}, ${JSON.stringify(input.payload)}::jsonb)
    on conflict (case_id, external_id) do nothing
    returning id`;
  if (inserted) return inserted.id;
  const [existing] = await sql<{ id: string; payload_hash: string }[]>`select id, payload_hash from evidence
    where case_id = ${input.caseId} and external_id = ${input.externalId}`;
  if (!existing) throw new AppError("EVIDENCE_UPSERT_FAILED", 500);
  if (existing.payload_hash !== payloadHash) throw new AppError("EVIDENCE_SNAPSHOT_CONFLICT", 409);
  return existing.id;
}

async function upsertEdge(
  sql: TransactionSql,
  input: {
    caseId: string;
    fromType: string;
    fromId: string;
    relation: string;
    toType: string;
    toId: string;
    evidenceId: string;
  },
): Promise<void> {
  await sql`insert into graph_edges
    (case_id, from_type, from_id, relation, to_type, to_id, evidence_id)
    values (${input.caseId}, ${input.fromType}, ${input.fromId}, ${input.relation}, ${input.toType},
      ${input.toId}, ${input.evidenceId})
    on conflict (case_id, from_type, from_id, relation, to_type, to_id, evidence_id) do nothing`;
}

export async function reconcileCaseObligationGraph(databaseUrl: string, caseRef: string): Promise<void> {
  const { client } = createDatabase(databaseUrl);
  try {
    await client.begin(async (sql) => {
      const [caseRecord] = await sql<{
        id: string;
        order_id: string;
        external_ref: string;
        opened_at: Date | string;
      }[]>`select id, order_id, external_ref, opened_at from cases
        where external_ref = ${caseRef} for update`;
      if (!caseRecord) throw new AppError("CASE_NOT_FOUND", 404);

      const [order] = await sql<{
        id: string;
        external_ref: string;
        currency: string;
        total_minor: number;
        status: string;
        policy_version_id: string;
        created_at: Date | string;
      }[]>`select id, external_ref, currency, total_minor, status, policy_version_id, created_at
        from orders where id = ${caseRecord.order_id} for update`;
      if (!order) throw new AppError("CASE_ORDER_NOT_FOUND", 500);

      const items = await sql<{
        id: string;
        sku: string;
        quantity: number;
        unit_minor: number;
        tax_minor: number;
        shipping_allocation_minor: number;
        fulfillment_status: string;
      }[]>`select id, sku, quantity, unit_minor, tax_minor, shipping_allocation_minor, fulfillment_status
        from order_items where order_id = ${order.id} order by id for update`;
      const captures = await sql<{
        id: string;
        provider: string;
        status: string;
        captured_minor: number;
        currency: string;
        verified_at: Date | string | null;
        created_at: Date | string;
      }[]>`select id, provider, status, captured_minor, currency, verified_at, created_at
        from captures where order_id = ${order.id} order by id for update`;
      for (const item of items.filter((candidate) => candidate.fulfillment_status === "RETURNED_TO_SENDER")) {
        const entitledMinor = (item.unit_minor * item.quantity) + item.tax_minor + item.shipping_allocation_minor;
        await sql`insert into obligations
          (order_id, item_id, case_id, kind, reason_key, currency, entitled_minor, status, policy_version_id)
          values (${order.id}, ${item.id}, ${caseRecord.id}, 'CUSTOMER_REFUND',
            'order-item:returned_to_sender', ${order.currency}, ${entitledMinor}, 'OPEN', ${order.policy_version_id})
          on conflict (order_id, item_id, reason_key) do update set
            case_id = excluded.case_id,
            entitled_minor = excluded.entitled_minor,
            policy_version_id = excluded.policy_version_id`;
      }
      const obligations = await sql<{
        id: string;
        item_id: string;
        reason_key: string;
        entitled_minor: number;
      }[]>`select id, item_id, reason_key, entitled_minor from obligations
        where case_id = ${caseRecord.id} order by id for update`;
      if (obligations.length === 0) throw new AppError("CASE_OBLIGATION_NOT_FOUND", 409);

      const orderEvidenceId = await upsertEvidence(sql, {
        caseId: caseRecord.id,
        provider: "MERCHANT_LEDGER",
        sourceTier: "MERCHANT_ATTESTED",
        externalId: `s4:order:${order.id}`,
        observedAt: order.created_at,
        synthetic: false,
        payload: {
          orderId: order.id,
          externalRef: order.external_ref,
          currency: order.currency,
          totalMinor: order.total_minor,
          status: order.status,
          itemCount: items.length,
        },
      });
      const policyEvidenceId = await upsertEvidence(sql, {
        caseId: caseRecord.id,
        provider: "POLICY_SNAPSHOT",
        sourceTier: "MERCHANT_ATTESTED",
        externalId: `s4:policy:${order.policy_version_id}`,
        observedAt: caseRecord.opened_at,
        synthetic: false,
        payload: { policyVersionId: order.policy_version_id, version: "v1", currency: "USD" },
      });

      for (const item of items) {
        await upsertEdge(sql, {
          caseId: caseRecord.id,
          fromType: "ORDER",
          fromId: order.id,
          relation: "HAS_ITEM",
          toType: "ITEM",
          toId: item.id,
          evidenceId: orderEvidenceId,
        });
      }

      for (const capture of captures) {
        const providerVerified = capture.provider === "PAYPAL";
        const captureEvidenceId = await upsertEvidence(sql, {
          caseId: caseRecord.id,
          provider: capture.provider,
          sourceTier: providerVerified ? "PROVIDER_VERIFIED" : "SYNTHETIC",
          externalId: `s4:capture:${capture.id}`,
          observedAt: capture.verified_at ?? capture.created_at,
          synthetic: !providerVerified,
          payload: {
            captureId: capture.id,
            provider: capture.provider,
            status: capture.status,
            capturedMinor: capture.captured_minor,
            currency: capture.currency,
          },
        });
        await upsertEdge(sql, {
          caseId: caseRecord.id,
          fromType: "ORDER",
          fromId: order.id,
          relation: "PAID_BY",
          toType: "CAPTURE",
          toId: capture.id,
          evidenceId: captureEvidenceId,
        });
      }

      for (const obligation of obligations) {
        await upsertEdge(sql, {
          caseId: caseRecord.id,
          fromType: "ITEM",
          fromId: obligation.item_id,
          relation: "SUBJECT_TO",
          toType: "OBLIGATION",
          toId: obligation.id,
          evidenceId: policyEvidenceId,
        });
        const refunds = obligations.length === 1 ? await sql<{
          id: string;
          provider: string;
          status: string;
          amount_minor: number;
          currency: string;
          verified_at: Date | string | null;
          created_at: Date | string;
        }[]>`select r.id, c.provider, r.status, r.amount_minor, r.currency, r.verified_at, r.created_at
          from refunds r join captures c on c.id = r.capture_id
          where c.order_id = ${order.id} order by r.id for update` : [];
        for (const refund of refunds) {
          if (refund.status !== "COMPLETED" && refund.status !== "PENDING") continue;
          const allocationState = refund.status === "COMPLETED" ? "COMPLETED" : "RESERVED";
          const allocationMinor = Math.min(refund.amount_minor, obligation.entitled_minor);
          await sql`insert into obligation_allocations (obligation_id, refund_id, amount_minor, state)
            values (${obligation.id}, ${refund.id}, ${allocationMinor}, ${allocationState})
            on conflict (obligation_id, refund_id) do update set
              amount_minor = excluded.amount_minor, state = excluded.state`;
          const providerVerified = refund.provider === "PAYPAL";
          const refundEvidenceId = await upsertEvidence(sql, {
            caseId: caseRecord.id,
            provider: refund.provider,
            sourceTier: providerVerified ? "PROVIDER_VERIFIED" : "SYNTHETIC",
            externalId: `s4:refund:${refund.id}`,
            observedAt: refund.verified_at ?? refund.created_at,
            synthetic: !providerVerified,
            payload: {
              refundId: refund.id,
              provider: refund.provider,
              status: refund.status,
              amountMinor: refund.amount_minor,
              currency: refund.currency,
            },
          });
          await upsertEdge(sql, {
            caseId: caseRecord.id,
            fromType: "REFUND",
            fromId: refund.id,
            relation: "SATISFIES",
            toType: "OBLIGATION",
            toId: obligation.id,
            evidenceId: refundEvidenceId,
          });
        }
      }

      await sql`update obligations ob set status = case
          when coalesce((select sum(oa.amount_minor) from obligation_allocations oa
            where oa.obligation_id = ob.id and oa.state = 'COMPLETED'), 0) >= ob.entitled_minor then 'SATISFIED'
          when coalesce((select sum(oa.amount_minor) from obligation_allocations oa
            where oa.obligation_id = ob.id and oa.state = 'RESERVED'), 0) > 0 then 'PENDING'
          else 'OPEN'
        end where ob.case_id = ${caseRecord.id}`;

      const shipmentLinks = await sql<{
        item_id: string;
        shipment_id: string;
        event_id: string | null;
        evidence_id: string | null;
      }[]>`select si.order_item_id as item_id, s.id as shipment_id,
          latest.id as event_id, e.id as evidence_id
        from shipment_items si
        join shipments s on s.id = si.shipment_id
        left join lateral (
          select se.id, se.provider_event_id from shipment_events se
          where se.shipment_id = s.id order by se.observed_at desc, se.id desc limit 1
        ) latest on true
        left join evidence e on e.case_id = ${caseRecord.id} and e.external_id = latest.provider_event_id
        where s.order_id = ${order.id} order by si.order_item_id, s.id`;
      for (const link of shipmentLinks) {
        if (!link.evidence_id) continue;
        await upsertEdge(sql, {
          caseId: caseRecord.id,
          fromType: "ITEM",
          fromId: link.item_id,
          relation: "PACKED_IN",
          toType: "SHIPMENT",
          toId: link.shipment_id,
          evidenceId: link.evidence_id,
        });
        if (link.event_id) {
          await upsertEdge(sql, {
            caseId: caseRecord.id,
            fromType: "SHIPMENT",
            fromId: link.shipment_id,
            relation: "REPORTED_AS",
            toType: "EVENT",
            toId: link.event_id,
            evidenceId: link.evidence_id,
          });
        }
      }
    });
  } finally {
    await client.end();
  }
}

export async function readCaseObligation(
  databaseUrl: string,
  caseRef: string,
): Promise<ObligationEngineOutput> {
  const { client } = createDatabase(databaseUrl);
  try {
    const [record] = await client<{
      fixture_id: string;
      order_id: string;
      item_id: string;
      obligation_key: string;
      currency: string;
      capture_currency: string;
      fulfillment_status: "DELIVERED" | "RETURNED_TO_SENDER";
      quantity: number;
      unit_minor: number;
      tax_minor: number;
      shipping_minor: number;
      completed_capture_minor: number;
      completed_allocated_minor: number;
      reserved_allocated_minor: number;
      unallocated_completed_refund_minor: number;
      unallocated_pending_refund_minor: number;
    }[]>`select o.fixture_key as fixture_id, o.id as order_id, oi.id as item_id,
        concat(o.id, ':', oi.id, ':', ob.reason_key) as obligation_key,
        ob.currency, coalesce((select min(c.currency) from captures c where c.order_id = o.id), o.currency) as capture_currency,
        oi.fulfillment_status, oi.quantity, oi.unit_minor, oi.tax_minor,
        oi.shipping_allocation_minor as shipping_minor,
        coalesce((select sum(c.captured_minor)::int from captures c where c.order_id = o.id and c.status = 'COMPLETED'), 0) as completed_capture_minor,
        coalesce((select sum(oa.amount_minor)::int from obligation_allocations oa where oa.obligation_id = ob.id and oa.state = 'COMPLETED'), 0) as completed_allocated_minor,
        coalesce((select sum(oa.amount_minor)::int from obligation_allocations oa where oa.obligation_id = ob.id and oa.state = 'RESERVED'), 0) as reserved_allocated_minor,
        coalesce((select sum(greatest(0, r.amount_minor - coalesce(a.allocated_minor, 0)))::int
          from refunds r join captures c on c.id = r.capture_id
          left join lateral (select sum(oa.amount_minor)::int as allocated_minor from obligation_allocations oa where oa.refund_id = r.id) a on true
          where c.order_id = o.id and r.status = 'COMPLETED'), 0) as unallocated_completed_refund_minor,
        coalesce((select sum(greatest(0, r.amount_minor - coalesce(a.allocated_minor, 0)))::int
          from refunds r join captures c on c.id = r.capture_id
          left join lateral (select sum(oa.amount_minor)::int as allocated_minor from obligation_allocations oa where oa.refund_id = r.id) a on true
          where c.order_id = o.id and r.status = 'PENDING'), 0) as unallocated_pending_refund_minor
      from cases cs
      join orders o on o.id = cs.order_id
      join obligations ob on ob.case_id = cs.id
      join order_items oi on oi.id = ob.item_id
      where cs.external_ref = ${caseRef}
      order by ob.id limit 1`;
    if (!record) throw new AppError("CASE_OBLIGATION_NOT_FOUND", 404);

    const evidence = await client<{ id: string; payload_hash: string }[]>`select e.id, e.payload_hash
      from evidence e join cases cs on cs.id = e.case_id
      where cs.external_ref = ${caseRef} order by e.id`;
    if (evidence.length === 0) throw new AppError("CASE_EVIDENCE_NOT_FOUND", 409);
    const evidenceHash = hashJson(evidence.map((item) => `${item.id}:${item.payload_hash}`));

    return deriveObligation({
      fixtureId: record.fixture_id,
      orderId: record.order_id,
      itemId: record.item_id,
      obligationKey: record.obligation_key,
      policyVersion: "v1",
      currency: record.currency,
      captureCurrency: record.capture_currency,
      fulfillmentStatus: record.fulfillment_status,
      quantity: record.quantity,
      unitMinor: record.unit_minor,
      taxMinor: record.tax_minor,
      shippingMinor: record.shipping_minor,
      completedCaptureMinor: record.completed_capture_minor,
      completedAllocatedMinor: record.completed_allocated_minor,
      reservedAllocatedMinor: record.reserved_allocated_minor,
      unallocatedCompletedRefundMinor: record.unallocated_completed_refund_minor,
      unallocatedPendingRefundMinor: record.unallocated_pending_refund_minor,
      requestedMinor: record.unit_minor * record.quantity + record.tax_minor + record.shipping_minor,
      evidenceIds: evidence.map((item) => item.id),
      evidenceHash,
      unknownPaymentOutcome: record.reserved_allocated_minor > 0,
    });
  } finally {
    await client.end();
  }
}
