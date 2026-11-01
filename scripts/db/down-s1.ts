import { loadLocalEnvironment, requireEnvironment } from "../smoke/common";
import { createDatabase } from "../../src/server/db/client";

loadLocalEnvironment();

if (process.env.ALLOW_S1_DOWN !== "true") {
  throw new Error("S1_DOWN_GUARD: set ALLOW_S1_DOWN=true for the exact S1 schema rollback");
}

const { client } = createDatabase(requireEnvironment("DATABASE_URL"));

try {
  const [s2] = await client<{ exists: boolean }[]>`select to_regclass('public.paypal_orders') is not null as exists`;
  if (s2?.exists) throw new Error("S1_DOWN_REFUSED_AFTER_S2: use a sprint-specific forward migration");
  await client.begin(async (sql) => {
    await sql`drop table if exists public.audit_events cascade`;
    await sql`drop table if exists public.evidence cascade`;
    await sql`drop table if exists public.obligations cascade`;
    await sql`drop table if exists public.cases cascade`;
    await sql`drop table if exists public.refunds cascade`;
    await sql`drop table if exists public.captures cascade`;
    await sql`drop table if exists public.order_items cascade`;
    await sql`drop table if exists public.orders cascade`;
    await sql`drop table if exists public.policy_versions cascade`;
    await sql`drop table if exists public.users cascade`;
    await sql`drop table if exists public.merchants cascade`;
    await sql`drop table if exists public.__drizzle_migrations cascade`;
  });
  console.log(JSON.stringify({ status: "PASS", operation: "migration-down-s1" }));
} finally {
  await client.end();
}
