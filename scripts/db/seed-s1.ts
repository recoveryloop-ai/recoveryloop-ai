import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

import { createDatabase } from "../../src/server/db/client";
import { policyV1 } from "../../src/server/modules/policy/policy-v1";
import { loadLocalEnvironment, requireEnvironment } from "../smoke/common";

loadLocalEnvironment();

const ids = {
  merchant: "10000000-0000-4000-8000-000000000001",
  policy: "10000000-0000-4000-8000-000000000002",
  operator: "10000000-0000-4000-8000-000000000003",
  orders: [
    "20000000-0000-4000-8000-000000000001", "20000000-0000-4000-8000-000000000002",
    "20000000-0000-4000-8000-000000000003", "20000000-0000-4000-8000-000000000004",
    "20000000-0000-4000-8000-000000000005",
  ],
  items: [
    "30000000-0000-4000-8000-000000000001", "30000000-0000-4000-8000-000000000002",
    "30000000-0000-4000-8000-000000000003", "30000000-0000-4000-8000-000000000004",
    "30000000-0000-4000-8000-000000000005", "30000000-0000-4000-8000-000000000006",
  ],
  captures: [
    "40000000-0000-4000-8000-000000000001", "40000000-0000-4000-8000-000000000002",
    "40000000-0000-4000-8000-000000000003", "40000000-0000-4000-8000-000000000004",
    "40000000-0000-4000-8000-000000000005",
  ],
  refunds: ["50000000-0000-4000-8000-000000000003", "50000000-0000-4000-8000-000000000004"],
  cases: [
    "60000000-0000-4000-8000-000000000002", "60000000-0000-4000-8000-000000000003",
    "60000000-0000-4000-8000-000000000004", "60000000-0000-4000-8000-000000000005",
  ],
  obligations: [
    "70000000-0000-4000-8000-000000000002", "70000000-0000-4000-8000-000000000003",
    "70000000-0000-4000-8000-000000000004", "70000000-0000-4000-8000-000000000005",
  ],
  evidence: [
    "80000000-0000-4000-8000-000000000002", "80000000-0000-4000-8000-000000000003",
    "80000000-0000-4000-8000-000000000004", "80000000-0000-4000-8000-000000000005",
  ],
} as const;

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const supabase = createClient(
  requireEnvironment("SUPABASE_URL"),
  requireEnvironment("SUPABASE_SECRET_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const operatorEmail = requireEnvironment("DEMO_OPERATOR_EMAIL").toLowerCase();
const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 100 });
if (authError) throw authError;
const authUser = authUsers.users.find((user) => user.email?.toLowerCase() === operatorEmail);
if (!authUser) throw new Error("DEMO_OPERATOR_AUTH_USER_NOT_FOUND");
if (!authUser.email_confirmed_at) throw new Error("DEMO_OPERATOR_EMAIL_NOT_CONFIRMED");
if (authUser.app_metadata.role !== "operator" && authUser.app_metadata.role !== "admin") {
  throw new Error("DEMO_OPERATOR_APP_METADATA_ROLE_INVALID");
}

const { client } = createDatabase(requireEnvironment("DATABASE_URL"));

try {
  await client.begin(async (sql) => {
    await sql`insert into merchants (id, name, currency, demo_mode)
      values (${ids.merchant}, 'Loop Devices', 'USD', true)
      on conflict (id) do update set name = excluded.name`;
    await sql`insert into policy_versions (id, merchant_id, version, json_rules, effective_at)
      values (${ids.policy}, ${ids.merchant}, ${policyV1.version}, ${JSON.stringify(policyV1)}::jsonb, ${policyV1.effectiveAt})
      on conflict (merchant_id, version) do update set json_rules = excluded.json_rules`;
    await sql`insert into users (id, merchant_id, auth_subject, email, role)
      values (${ids.operator}, ${ids.merchant}, ${authUser.id}, ${operatorEmail}, ${authUser.app_metadata.role})
      on conflict (auth_subject) do update set email = excluded.email, role = excluded.role`;

    const fixtureOrders = [
      { id: ids.orders[0], key: "F01", ref: "DEMO-F01", total: 15_000, status: "DELIVERED" },
      { id: ids.orders[1], key: "F02", ref: "RG-2048", total: 25_000, status: "PARTIALLY_RETURNED" },
      { id: ids.orders[2], key: "F03", ref: "DEMO-F03", total: 10_000, status: "RETURNED" },
      { id: ids.orders[3], key: "F04", ref: "DEMO-F04", total: 10_000, status: "RETURNED" },
      { id: ids.orders[4], key: "F05", ref: "DEMO-F05", total: 3_000, status: "RETURNED" },
    ] as const;
    for (const order of fixtureOrders) {
      await sql`insert into orders (id, merchant_id, external_ref, fixture_key, currency, total_minor, status, policy_version_id)
        values (${order.id}, ${ids.merchant}, ${order.ref}, ${order.key}, 'USD', ${order.total}, ${order.status}, ${ids.policy})
        on conflict (id) do update set external_ref = excluded.external_ref, total_minor = excluded.total_minor, status = excluded.status`;
    }

    const fixtureItems = [
      { id: ids.items[0], orderId: ids.orders[0], sku: "A", name: "Atlas Studio Headphones", unit: 15_000, fulfillment: "DELIVERED" },
      { id: ids.items[1], orderId: ids.orders[1], sku: "A", name: "Atlas Studio Headphones", unit: 15_000, fulfillment: "DELIVERED" },
      { id: ids.items[2], orderId: ids.orders[1], sku: "B", name: "Orbit Mechanical Keyboard", unit: 10_000, fulfillment: "RETURNED_TO_SENDER" },
      { id: ids.items[3], orderId: ids.orders[2], sku: "B", name: "Orbit Mechanical Keyboard", unit: 10_000, fulfillment: "RETURNED_TO_SENDER" },
      { id: ids.items[4], orderId: ids.orders[3], sku: "B", name: "Orbit Mechanical Keyboard", unit: 10_000, fulfillment: "RETURNED_TO_SENDER" },
      { id: ids.items[5], orderId: ids.orders[4], sku: "C", name: "Pulse USB-C Hub", unit: 3_000, fulfillment: "RETURNED_TO_SENDER" },
    ] as const;
    for (const item of fixtureItems) {
      await sql`insert into order_items (id, order_id, sku, name, quantity, unit_minor, fulfillment_status)
        values (${item.id}, ${item.orderId}, ${item.sku}, ${item.name}, 1, ${item.unit}, ${item.fulfillment})
        on conflict (id) do update set fulfillment_status = excluded.fulfillment_status`;
    }

    for (let index = 0; index < fixtureOrders.length; index += 1) {
      const order = fixtureOrders[index];
      const captureId = ids.captures[index];
      if (!order || !captureId) throw new Error("FIXTURE_INDEX_MISMATCH");
      await sql`insert into captures (id, order_id, provider, provider_capture_id, status, captured_minor, currency, verified_at)
        values (${captureId}, ${order.id}, 'FIXTURE', ${`SYNTHETIC-CAP-${order.key}`}, 'COMPLETED', ${order.total}, 'USD', now())
        on conflict (id) do update set status = excluded.status`;
    }
    await sql`insert into refunds (id, capture_id, provider_refund_id, status, amount_minor, currency, verified_at)
      values (${ids.refunds[0]}, ${ids.captures[2]}, 'SYNTHETIC-REF-F03', 'COMPLETED', 10000, 'USD', now())
      on conflict (id) do update set status = excluded.status`;
    await sql`insert into refunds (id, capture_id, provider_refund_id, status, amount_minor, currency, verified_at)
      values (${ids.refunds[1]}, ${ids.captures[3]}, 'SYNTHETIC-REF-F04', 'PENDING', 10000, 'USD', null)
      on conflict (id) do update set status = excluded.status`;

    const exceptionFixtures = [
      { index: 0, key: "F02", caseRef: "RG-2048", orderId: ids.orders[1], itemId: ids.items[2], amount: 10_000, obligation: "OPEN" },
      { index: 1, key: "F03", caseRef: "RG-2049", orderId: ids.orders[2], itemId: ids.items[3], amount: 10_000, obligation: "SATISFIED" },
      { index: 2, key: "F04", caseRef: "RG-2050", orderId: ids.orders[3], itemId: ids.items[4], amount: 10_000, obligation: "PENDING" },
      { index: 3, key: "F05", caseRef: "RG-2051", orderId: ids.orders[4], itemId: ids.items[5], amount: 3_000, obligation: "OPEN" },
    ] as const;
    for (const fixture of exceptionFixtures) {
      const caseId = ids.cases[fixture.index];
      const obligationId = ids.obligations[fixture.index];
      const evidenceId = ids.evidence[fixture.index];
      if (!caseId || !obligationId || !evidenceId) throw new Error("FIXTURE_INDEX_MISMATCH");
      await sql`insert into cases (id, order_id, external_ref, kind, status, severity)
        values (${caseId}, ${fixture.orderId}, ${fixture.caseRef}, 'DELIVERY_FAILURE', 'OPEN', 'MEDIUM')
        on conflict (id) do update set external_ref = excluded.external_ref, status = excluded.status`;
      await sql`insert into obligations (id, order_id, item_id, case_id, kind, reason_key, currency, entitled_minor, status, policy_version_id)
        values (${obligationId}, ${fixture.orderId}, ${fixture.itemId}, ${caseId}, 'CUSTOMER_REFUND', 'order-item:returned_to_sender', 'USD', ${fixture.amount}, ${fixture.obligation}, ${ids.policy})
        on conflict (id) do update set status = excluded.status`;
      const evidencePayload = { fixture: fixture.key, event: "RETURNED_TO_SENDER", source: "fixture" };
      await sql`insert into evidence (id, case_id, provider, source_tier, external_id, payload_hash, observed_at, synthetic_flag, redacted_json)
        values (${evidenceId}, ${caseId}, 'FIXTURE', 'SYNTHETIC', ${`${fixture.key}-RETURN-EVENT`}, ${hash(JSON.stringify(evidencePayload))}, now(), true, ${JSON.stringify(evidencePayload)}::jsonb)
        on conflict (id) do update set provider = excluded.provider, source_tier = excluded.source_tier,
          payload_hash = excluded.payload_hash, synthetic_flag = excluded.synthetic_flag, redacted_json = excluded.redacted_json`;
      await sql`insert into audit_events (merchant_id, actor, case_id, event_type, details_hash, details)
        select ${ids.merchant}, 'seed:s1', ${caseId}, 'FIXTURE_SEEDED', ${hash(fixture.key)}, ${JSON.stringify({ fixture: fixture.key })}::jsonb
        where not exists (select 1 from audit_events where case_id = ${caseId} and event_type = 'FIXTURE_SEEDED')`;
    }
  });
  console.log(JSON.stringify({ status: "PASS", operation: "seed-s1", fixtures: 5, operator: operatorEmail }));
} finally {
  await client.end();
}
