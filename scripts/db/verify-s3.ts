import { EasyPostTestProvider } from "../../src/server/adapters/logistics/easypost-test-provider";
import { createDatabase } from "../../src/server/db/client";
import { CarrierIngestionService } from "../../src/server/modules/logistics/carrier-ingestion-service";
import { loadLocalEnvironment, requireEnvironment } from "../smoke/common";

loadLocalEnvironment();
const databaseUrl = requireEnvironment("DATABASE_URL");
const { client } = createDatabase(databaseUrl);
class VerificationRollback extends Error {}

try {
  const [shipment] = await client<{
    id: string;
    status: string;
    source_tier: string;
    synthetic_flag: boolean;
    raw_payload_hash: string;
  }[]>`select s.id, s.status, s.source_tier, s.synthetic_flag, s.raw_payload_hash
    from shipments s join orders o on o.id = s.order_id
    where o.fixture_key = 'F02' and s.provider = 'EASYPOST'`;
  if (!shipment || shipment.status !== "RETURN_TO_SENDER" || shipment.source_tier !== "PROVIDER_TEST"
    || shipment.synthetic_flag || shipment.raw_payload_hash.length !== 64) {
    throw new Error(`S3_SHIPMENT_INVARIANT_FAILED:${JSON.stringify(shipment)}`);
  }

  const mappings = await client<{ sku: string; source_tier: string; synthetic_flag: boolean }[]>`select oi.sku, si.source_tier, si.synthetic_flag
    from shipment_items si join order_items oi on oi.id = si.order_item_id
    where si.shipment_id = ${shipment.id}`;
  if (mappings.length !== 1 || mappings[0]?.sku !== "B" || mappings[0].source_tier !== "SYNTHETIC" || !mappings[0].synthetic_flag) {
    throw new Error(`S3_MAPPING_INVARIANT_FAILED:${JSON.stringify(mappings)}`);
  }

  const events = await client<{
    provider_event_id: string;
    event_type: string;
    source_tier: string;
    synthetic_flag: boolean;
    raw_payload_hash: string;
    observed_at: Date | string;
    recorded_at: Date | string;
  }[]>`select provider_event_id, event_type, source_tier, synthetic_flag, raw_payload_hash, observed_at, recorded_at
    from shipment_events where shipment_id = ${shipment.id} order by observed_at`;
  if (events.length === 0 || !events.some((event) => event.event_type === "RETURN_TO_SENDER") || events.some((event) => (
    event.source_tier !== "PROVIDER_TEST" || event.synthetic_flag || event.raw_payload_hash.length !== 64 ||
    !event.observed_at || !event.recorded_at
  ))) throw new Error(`S3_EVENT_INVARIANT_FAILED:${JSON.stringify(events)}`);
  if (new Set(events.map((event) => event.provider_event_id)).size !== events.length) throw new Error("S3_DUPLICATE_EVENT_FOUND");

  const [caseRecord] = await client<{
    id: string;
    external_ref: string;
    kind: string;
    rule_key: string;
    source_tier: string;
    detection_key: string | null;
  }[]>`select c.id, c.external_ref, c.kind, c.rule_key, c.source_tier, c.detection_key
    from cases c join orders o on o.id = c.order_id where o.fixture_key = 'F02'`;
  if (!caseRecord || caseRecord.external_ref !== "RG-2048" || caseRecord.kind !== "DELIVERY_FAILURE"
    || caseRecord.rule_key !== "R01" || caseRecord.source_tier !== "PROVIDER_TEST" || !caseRecord.detection_key) {
    throw new Error(`S3_CASE_INVARIANT_FAILED:${JSON.stringify(caseRecord)}`);
  }

  const providerEvidence = await client<{ count: number }[]>`select count(*)::int as count from evidence
    where case_id = ${caseRecord.id} and provider = 'EASYPOST' and source_tier = 'PROVIDER_TEST'
      and synthetic_flag = false and length(payload_hash) = 64`;
  if (providerEvidence[0]?.count !== 1) throw new Error(`S3_EVIDENCE_INVARIANT_FAILED:${providerEvidence[0]?.count}`);

  const [audit] = await client<{ count: number }[]>`select count(*)::int as count from audit_events
    where case_id = ${caseRecord.id} and event_type = 'EASYPOST_TEST_EVENT_INGESTED'`;
  if (audit?.count !== 1) throw new Error(`S3_AUDIT_IDEMPOTENCY_FAILED:${audit?.count}`);

  const newTables = await client<{ tablename: string; rowsecurity: boolean }[]>`select tablename, rowsecurity from pg_tables
    where schemaname = 'public' and tablename in ('shipments', 'shipment_items', 'shipment_events') order by tablename`;
  if (newTables.length !== 3 || newTables.some((table) => !table.rowsecurity)) {
    throw new Error(`S3_RLS_INVARIANT_FAILED:${JSON.stringify(newTables)}`);
  }
  const [grants] = await client<{ count: number }[]>`select count(*)::int as count from information_schema.role_table_grants
    where table_schema = 'public' and table_name in ('shipments', 'shipment_items', 'shipment_events')
      and grantee in ('anon', 'authenticated')`;
  if (grants?.count !== 0) throw new Error(`S3_PUBLIC_GRANT_INVARIANT_FAILED:${grants?.count}`);

  const service = new CarrierIngestionService({
    databaseUrl,
    carrierProvider: new EasyPostTestProvider({ apiKey: requireEnvironment("EASYPOST_API_KEY") }),
  });
  let caseCreationFromCleanState = false;
  try {
    await client.begin(async (sql) => {
      await sql`update obligations set case_id = null where case_id = ${caseRecord.id}`;
      await sql`delete from graph_edges where case_id = ${caseRecord.id}`;
      await sql`delete from investigations where case_id = ${caseRecord.id}`;
      await sql`delete from audit_events where case_id = ${caseRecord.id}`;
      await sql`delete from evidence where case_id = ${caseRecord.id}`;
      await sql`delete from cases where id = ${caseRecord.id}`;
      const [before] = await sql<{ count: number }[]>`select count(*)::int as count from cases where external_ref = 'RG-2048'`;
      if (before?.count !== 0) throw new Error(`S3_CASE_BEFORE_NOT_EMPTY:${before?.count}`);

      const created = await service.ingestWithinTransaction(
        { fixtureKey: "F02", itemSkus: ["B"], trackingCode: "EZ5000000005" },
        sql,
      );
      const [after] = await sql<{ count: number }[]>`select count(*)::int as count from cases
        where external_ref = 'RG-2048' and rule_key = 'R01' and source_tier = 'PROVIDER_TEST'`;
      if (created.caseAction !== "CREATED" || after?.count !== 1) {
        throw new Error(`S3_CASE_CREATION_PROOF_FAILED:${JSON.stringify({ action: created.caseAction, count: after?.count })}`);
      }
      caseCreationFromCleanState = true;
      throw new VerificationRollback();
    });
  } catch (error) {
    if (!(error instanceof VerificationRollback)) throw error;
  }
  if (!caseCreationFromCleanState) throw new Error("S3_CASE_CREATION_PROOF_MISSING");
  const [restoredCase] = await client<{ id: string }[]>`select id from cases where id = ${caseRecord.id}`;
  if (!restoredCase) throw new Error("S3_CASE_ROLLBACK_FAILED");

  console.log(JSON.stringify({
    status: "PASS",
    operation: "verify-s3",
    fixture: "F02",
    caseRef: caseRecord.external_ref,
    caseRule: caseRecord.rule_key,
    shipmentStatus: shipment.status,
    providerEventCount: events.length,
    providerEvidenceCount: providerEvidence[0].count,
    syntheticItemMappings: mappings.length,
    duplicateEvents: false,
    ingestionAuditEvents: audit.count,
    caseCreationFromCleanState,
    creationProofRolledBack: true,
    rlsTables: newTables.length,
    anonAuthenticatedGrants: grants.count,
  }));
} finally {
  await client.end();
}
