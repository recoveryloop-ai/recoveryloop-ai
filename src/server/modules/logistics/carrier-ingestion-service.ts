import { createHash } from "node:crypto";

import type { TransactionSql } from "postgres";

import type { CarrierProvider, CarrierTracker, NormalizedCarrierStatus } from "../../adapters/logistics/carrier-provider";
import { createDatabase } from "../../db/client";
import { AppError } from "../../http/app-error";
import { evaluateCarrierRules, selectPrimaryFinding, type CarrierFinding } from "./carrier-rules";

export type CarrierIngestionInput = {
  fixtureKey: string;
  itemSkus: readonly string[];
  trackingCode: string;
};

export type CarrierIngestionResult = {
  fixtureKey: string;
  shipmentId: string;
  providerTrackerId: string;
  normalizedStatus: NormalizedCarrierStatus;
  insertedEventCount: number;
  findings: readonly CarrierFinding[];
  caseId: string | null;
  caseAction: "CREATED" | "ADOPTED" | "UPDATED" | "NONE";
};

export interface CarrierIngestionServiceOptions {
  databaseUrl: string;
  carrierProvider: CarrierProvider;
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function semanticDetectionKey(orderId: string, itemIds: readonly string[], ruleId: string): string {
  return `carrier:${hashJson({ orderId, itemIds: [...itemIds].sort(), ruleId }).slice(0, 48)}`;
}

export class CarrierIngestionService {
  constructor(private readonly options: CarrierIngestionServiceOptions) {}

  async ingest(input: CarrierIngestionInput): Promise<CarrierIngestionResult> {
    if (!input.fixtureKey.trim() || input.itemSkus.length === 0) throw new AppError("CARRIER_MAPPING_REQUIRED", 400);
    const createdTracker = await this.options.carrierProvider.createTracker(input.trackingCode);
    const tracker = await this.options.carrierProvider.getTracker(createdTracker.providerTrackerId);
    if (!tracker) throw new AppError("EASYPOST_TRACKER_READ_BACK_MISSING", 502, true);
    this.assertProviderReadBack(createdTracker, tracker);

    const { client } = createDatabase(this.options.databaseUrl);
    try {
      return await client.begin((sql) => this.persistTracker(sql, input, tracker));
    } finally {
      await client.end();
    }
  }

  async ingestWithinTransaction(input: CarrierIngestionInput, sql: TransactionSql): Promise<CarrierIngestionResult> {
    if (!input.fixtureKey.trim() || input.itemSkus.length === 0) throw new AppError("CARRIER_MAPPING_REQUIRED", 400);
    const createdTracker = await this.options.carrierProvider.createTracker(input.trackingCode);
    const tracker = await this.options.carrierProvider.getTracker(createdTracker.providerTrackerId);
    if (!tracker) throw new AppError("EASYPOST_TRACKER_READ_BACK_MISSING", 502, true);
    this.assertProviderReadBack(createdTracker, tracker);
    return this.persistTracker(sql, input, tracker);
  }

  private async persistTracker(
    sql: TransactionSql,
    input: CarrierIngestionInput,
    tracker: CarrierTracker,
  ): Promise<CarrierIngestionResult> {
        const [order] = await sql<{ id: string; external_ref: string }[]>`select id, external_ref
          from orders where fixture_key = ${input.fixtureKey} for update`;
        if (!order) throw new AppError("FIXTURE_ORDER_NOT_FOUND", 404);

        const orderItems = await sql<{ id: string; sku: string; fulfillment_status: string }[]>`select id, sku, fulfillment_status
          from order_items where order_id = ${order.id} order by sku`;
        const requestedSkus = new Set(input.itemSkus);
        const mappedItems = orderItems.filter((item) => requestedSkus.has(item.sku));
        if (mappedItems.length !== requestedSkus.size) throw new AppError("SHIPMENT_ITEM_MAPPING_INVALID", 409);

        const [completedCapture] = await sql<{ status: string }[]>`select status from captures
          where order_id = ${order.id} and status = 'COMPLETED' order by verified_at desc nulls last limit 1`;

        const [shipment] = await sql<{ id: string }[]>`insert into shipments
          (order_id, provider, provider_tracker_id, tracking_code, carrier, status, status_detail,
            source_tier, synthetic_flag, last_observed_at, last_recorded_at, raw_payload_hash)
          values (${order.id}, 'EASYPOST', ${tracker.providerTrackerId}, ${tracker.trackingCode}, ${tracker.carrier},
            ${tracker.status}, ${tracker.statusDetail}, 'PROVIDER_TEST', false, ${tracker.observedAt}, now(), ${tracker.rawPayloadHash})
          on conflict (provider, provider_tracker_id) do update set
            tracking_code = excluded.tracking_code,
            carrier = excluded.carrier,
            status = case when excluded.last_observed_at >= shipments.last_observed_at then excluded.status else shipments.status end,
            status_detail = case when excluded.last_observed_at >= shipments.last_observed_at then excluded.status_detail else shipments.status_detail end,
            last_observed_at = greatest(shipments.last_observed_at, excluded.last_observed_at),
            last_recorded_at = now(),
            raw_payload_hash = case when excluded.last_observed_at >= shipments.last_observed_at then excluded.raw_payload_hash else shipments.raw_payload_hash end,
            updated_at = now()
          returning id`;
        if (!shipment) throw new AppError("SHIPMENT_UPSERT_FAILED", 500);

        for (const item of mappedItems) {
          await sql`insert into shipment_items
            (shipment_id, order_item_id, quantity, source_tier, synthetic_flag)
            values (${shipment.id}, ${item.id}, 1, 'SYNTHETIC', true)
            on conflict (shipment_id, order_item_id) do nothing`;
        }

        let insertedEventCount = 0;
        for (const event of tracker.events) {
          const inserted = await sql<{ id: string }[]>`insert into shipment_events
            (shipment_id, provider, provider_event_id, event_type, event_detail, message, location,
              observed_at, source_tier, synthetic_flag, raw_payload_hash, raw_payload)
            values (${shipment.id}, 'EASYPOST', ${event.providerEventId}, ${event.status}, ${event.statusDetail},
              ${event.message}, ${JSON.stringify(event.location)}::jsonb, ${event.observedAt}, 'PROVIDER_TEST', false,
              ${event.rawPayloadHash}, ${JSON.stringify(event.rawPayload)}::jsonb)
            on conflict (provider, provider_event_id) do nothing returning id`;
          insertedEventCount += inserted.length;
        }

        const [latestEvent] = await sql<{
          provider_event_id: string;
          event_type: NormalizedCarrierStatus;
          event_detail: string | null;
          message: string | null;
          location: { city?: string | null; state?: string | null; country?: string | null; postalCode?: string | null };
          observed_at: Date | string;
          raw_payload_hash: string;
        }[]>`select provider_event_id, event_type, event_detail, message, location, observed_at, raw_payload_hash
          from shipment_events where shipment_id = ${shipment.id}
          order by observed_at desc, provider_event_id desc limit 1`;
        if (!latestEvent) throw new AppError("SHIPMENT_EVENT_MISSING", 500);

        const findings = evaluateCarrierRules({
          status: latestEvent.event_type,
          paymentStatus: completedCapture?.status ?? null,
          affectedItemCount: mappedItems.length,
          totalOrderItemCount: orderItems.length,
          deliveredOrderItemCount: orderItems.filter((item) => item.fulfillment_status === "DELIVERED").length,
        });
        const primaryFinding = selectPrimaryFinding(findings);
        if (!primaryFinding) {
          return {
            fixtureKey: input.fixtureKey,
            shipmentId: shipment.id,
            providerTrackerId: tracker.providerTrackerId,
            normalizedStatus: latestEvent.event_type,
            insertedEventCount,
            findings,
            caseId: null,
            caseAction: "NONE" as const,
          };
        }

        const detectionKey = semanticDetectionKey(order.id, mappedItems.map((item) => item.id), primaryFinding.ruleId);
        const [existingCase] = await sql<{ id: string; detection_key: string | null }[]>`select id, detection_key
          from cases where external_ref = ${order.external_ref} for update`;
        if (existingCase?.detection_key && existingCase.detection_key !== detectionKey) {
          throw new AppError("CASE_DETECTION_KEY_CONFLICT", 409);
        }
        const [caseRecord] = await sql<{ id: string }[]>`insert into cases
          (order_id, external_ref, kind, status, severity, detection_key, rule_key, source_tier, last_event_at)
          values (${order.id}, ${order.external_ref}, ${primaryFinding.caseKind}, 'OPEN', ${primaryFinding.severity},
            ${detectionKey}, ${primaryFinding.ruleId}, ${primaryFinding.sourceTier}, ${latestEvent.observed_at})
          on conflict (external_ref) do update set
            kind = excluded.kind,
            status = 'OPEN',
            severity = excluded.severity,
            detection_key = coalesce(cases.detection_key, excluded.detection_key),
            rule_key = excluded.rule_key,
            source_tier = excluded.source_tier,
            last_event_at = greatest(cases.last_event_at, excluded.last_event_at),
            updated_at = now()
          returning id`;
        if (!caseRecord) throw new AppError("CASE_UPSERT_FAILED", 500);

        await sql`insert into evidence
          (case_id, provider, source_tier, external_id, payload_hash, observed_at, synthetic_flag, redacted_json)
          values (${caseRecord.id}, 'EASYPOST', 'PROVIDER_TEST', ${latestEvent.provider_event_id},
            ${latestEvent.raw_payload_hash}, ${latestEvent.observed_at}, false,
            ${JSON.stringify({
              mode: "test",
              trackerId: tracker.providerTrackerId,
              status: latestEvent.event_type,
              statusDetail: latestEvent.event_detail,
              message: latestEvent.message,
              location: latestEvent.location,
              mapping: { itemSkus: [...input.itemSkus], sourceTier: "SYNTHETIC" },
              findings: findings.map((finding) => finding.reasonCode),
            })}::jsonb)
          on conflict (case_id, external_id) do nothing`;

        const auditDetails = {
          fixtureKey: input.fixtureKey,
          trackerId: tracker.providerTrackerId,
          eventId: latestEvent.provider_event_id,
          findings: findings.map((finding) => finding.ruleId),
          sourceTier: "PROVIDER_TEST",
          itemMappingSourceTier: "SYNTHETIC",
        };
        const auditHash = hashJson(auditDetails);
        await sql`insert into audit_events (merchant_id, actor, case_id, event_type, details_hash, details)
          select o.merchant_id, 'system:carrier-ingestion', ${caseRecord.id}, 'EASYPOST_TEST_EVENT_INGESTED',
            ${auditHash}, ${JSON.stringify(auditDetails)}::jsonb
          from orders o where o.id = ${order.id}
            and not exists (select 1 from audit_events where case_id = ${caseRecord.id}
              and event_type = 'EASYPOST_TEST_EVENT_INGESTED' and details_hash = ${auditHash})`;

        return {
          fixtureKey: input.fixtureKey,
          shipmentId: shipment.id,
          providerTrackerId: tracker.providerTrackerId,
          normalizedStatus: latestEvent.event_type,
          insertedEventCount,
          findings,
          caseId: caseRecord.id,
          caseAction: existingCase ? (existingCase.detection_key ? "UPDATED" as const : "ADOPTED" as const) : "CREATED" as const,
        };
  }

  private assertProviderReadBack(created: CarrierTracker, readBack: CarrierTracker): void {
    if (
      created.providerTrackerId !== readBack.providerTrackerId ||
      created.trackingCode !== readBack.trackingCode ||
      created.sourceTier !== "PROVIDER_TEST" ||
      readBack.sourceTier !== "PROVIDER_TEST" ||
      created.synthetic || readBack.synthetic
    ) throw new AppError("EASYPOST_TRACKER_READ_BACK_MISMATCH", 502);
  }
}
