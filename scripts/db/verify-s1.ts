import { loadLocalEnvironment, requireEnvironment } from "../smoke/common";
import { createDatabase } from "../../src/server/db/client";

loadLocalEnvironment();
const { client } = createDatabase(requireEnvironment("DATABASE_URL"));

try {
  const [counts] = await client<{ merchants: number; orders: number; policies: number; users: number }[]>`
    select
      (select count(*)::int from merchants) as merchants,
      (select count(*)::int from orders where fixture_key is not null) as orders,
      (select count(*)::int from policy_versions) as policies,
      (select count(*)::int from users) as users`;
  const totals = await client<{ fixture_key: string; stored: number; calculated: number }[]>`
    select o.fixture_key, o.total_minor as stored,
      sum((i.unit_minor * i.quantity) + i.tax_minor + i.shipping_allocation_minor)::int as calculated
    from orders o join order_items i on i.order_id = o.id
    where o.fixture_key is not null
    group by o.id, o.fixture_key, o.total_minor
    order by o.fixture_key`;
  if (!counts || counts.merchants !== 1 || counts.orders !== 5 || counts.policies !== 1 || counts.users !== 1) {
    throw new Error(`S1_COUNT_MISMATCH:${JSON.stringify(counts)}`);
  }
  if (totals.some((row) => row.stored !== row.calculated)) {
    throw new Error(`S1_TOTAL_MISMATCH:${JSON.stringify(totals)}`);
  }

  let duplicateRejected = false;
  try {
    await client.begin(async (sql) => {
      await sql`insert into orders (merchant_id, external_ref, fixture_key, currency, total_minor, status, policy_version_id)
        select merchant_id, external_ref, null, currency, total_minor, status, policy_version_id from orders where fixture_key = 'F01'`;
    });
  } catch (error) {
    duplicateRejected = error instanceof Error && ("code" in error) && error.code === "23505";
  }
  if (!duplicateRejected) throw new Error("DUPLICATE_EXTERNAL_REF_NOT_REJECTED");

  console.log(JSON.stringify({ status: "PASS", operation: "verify-s1", counts, totals, duplicateExternalRefRejected: true }));
} finally {
  await client.end();
}
