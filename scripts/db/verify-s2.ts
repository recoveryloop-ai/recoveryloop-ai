import { createHash, randomUUID } from "node:crypto";

import { createDatabase } from "../../src/server/db/client";
import { loadLocalEnvironment, requireEnvironment } from "../smoke/common";

loadLocalEnvironment();
const { client } = createDatabase(requireEnvironment("DATABASE_URL"));

class VerificationRollback extends Error {}

try {
  const [receipt] = await client<{
    order_id: string;
    order_status: string;
    paypal_status: string;
    capture_status: string;
    captured_minor: number;
    total_minor: number;
    capture_count: number;
    verified_at: Date | string | null;
  }[]>`select o.id as order_id, o.status as order_status, po.status as paypal_status,
      c.status as capture_status, c.captured_minor, o.total_minor, c.verified_at,
      (select count(*)::int from captures all_c where all_c.order_id = o.id and all_c.provider = 'PAYPAL') as capture_count
    from orders o
    join paypal_orders po on po.order_id = o.id
    join captures c on c.order_id = o.id and c.provider = 'PAYPAL'
    where o.status = 'PAID' and po.status = 'COMPLETED' and c.status = 'COMPLETED'
    order by c.created_at desc limit 1`;
  if (
    !receipt || receipt.capture_count !== 1 || receipt.captured_minor !== receipt.total_minor ||
    !receipt.verified_at
  ) throw new Error(`S2_RECEIPT_INVARIANT_FAILED:${JSON.stringify(receipt)}`);

  const eventId = `verification-${randomUUID()}`;
  const payloadHash = createHash("sha256").update(eventId).digest("hex");
  let dedupCount = 0;
  try {
    await client.begin(async (sql) => {
      await sql`insert into webhook_inbox (provider, event_id, verified, payload_hash)
        values ('PAYPAL', ${eventId}, true, ${payloadHash}) on conflict (provider, event_id) do nothing`;
      await sql`insert into webhook_inbox (provider, event_id, verified, payload_hash)
        values ('PAYPAL', ${eventId}, true, ${payloadHash}) on conflict (provider, event_id) do nothing`;
      const [row] = await sql<{ count: number }[]>`select count(*)::int as count from webhook_inbox
        where provider = 'PAYPAL' and event_id = ${eventId}`;
      dedupCount = row?.count ?? 0;
      throw new VerificationRollback();
    });
  } catch (error) {
    if (!(error instanceof VerificationRollback)) throw error;
  }
  if (dedupCount !== 1) throw new Error(`S2_WEBHOOK_DEDUP_FAILED:${dedupCount}`);
  const [persisted] = await client<{ count: number }[]>`select count(*)::int as count from webhook_inbox
    where provider = 'PAYPAL' and event_id = ${eventId}`;
  if (persisted?.count !== 0) throw new Error("S2_WEBHOOK_ROLLBACK_FAILED");

  const tables = await client<{ tablename: string; rowsecurity: boolean }[]>`select tablename, rowsecurity
    from pg_tables where schemaname = 'public' and tablename <> '__drizzle_migrations'
    order by tablename`;
  const expectedTables = [
    "actions", "audit_events", "captures", "cases", "certificates", "evidence", "graph_edges", "investigations", "merchants",
    "obligation_allocations", "obligations", "order_items", "orders", "paypal_orders", "policy_versions",
    "proposals", "refunds", "shipment_events", "shipment_items", "shipments", "users", "webhook_inbox",
  ];
  if (
    tables.map((table) => table.tablename).join(",") !== expectedTables.join(",") ||
    tables.some((table) => !table.rowsecurity)
  ) {
    throw new Error(`S2_RLS_INVARIANT_FAILED:${JSON.stringify(tables)}`);
  }
  const [publicGrants] = await client<{ count: number }[]>`select count(*)::int as count
    from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated')`;
  if (publicGrants?.count !== 0) throw new Error(`S2_PUBLIC_GRANT_INVARIANT_FAILED:${publicGrants?.count}`);
  const [databaseRole] = await client<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }[]>`
    select rolname, rolsuper, rolbypassrls from pg_roles where rolname = current_user`;
  if (!databaseRole || databaseRole.rolsuper || databaseRole.rolbypassrls) {
    throw new Error(`S2_DATABASE_ROLE_INVARIANT_FAILED:${JSON.stringify(databaseRole)}`);
  }

  console.log(JSON.stringify({
    status: "PASS",
    operation: "verify-s2",
    receipt: {
      orderStatus: receipt.order_status,
      providerStatus: receipt.paypal_status,
      captureStatus: receipt.capture_status,
      amountMatches: receipt.captured_minor === receipt.total_minor,
      captureCount: receipt.capture_count,
    },
    webhookDeduplication: true,
    verificationWriteRolledBack: true,
    rowLevelSecurityTables: tables.length,
    anonAuthenticatedTableGrants: publicGrants.count,
    databaseRole: { name: databaseRole.rolname, superuser: databaseRole.rolsuper, bypassRls: databaseRole.rolbypassrls },
  }));
} finally {
  await client.end();
}
